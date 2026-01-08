from codes import connect_mysql
import os
from flask import jsonify
import re
import logging  # 添加logging模块导入
import time
from codes.video_queries_new import get_videos_paginated_new
from codes.video_queries_new import check_video_access_new
import traceback

# 数据库连接实例
db=connect_mysql.Connect_mysql()

def save_video_config(video_base, thumbnail_base):
    """保存视频和缩略图根路径配置到环境变量（已废弃，保留兼容性）"""
    try:
        # 新系统不需要这些配置，直接返回成功
        return {'status': 'success', 'message': '配置保存成功（新系统已不需要此配置）'}
            
    except Exception as e:
        print(f'保存视频配置异常：{str(e)}')
        return {'status': 'error', 'message': str(e)}



def update_video_config(video_base, thumbnail_base):
    """更新视频配置到环境变量（已废弃，保留兼容性）"""
    try:
        # 新系统不需要这些配置，直接返回成功
        return jsonify(success=True, message="配置更新成功（新系统已不需要此配置）")
    except Exception as e:
        return jsonify(success=False, message=str(e))

def get_video_config():
    """从环境变量获取视频配置（已废弃，保留兼容性）"""
    try:
        # 返回空配置，因为新系统不需要这些配置
        return {'video_base': '', 'thumbnail_base': ''}
    except Exception as e:
        print(f'获取视频配置异常：{str(e)}')
        return None

# 注册
def register(account, password):
    # 验证本命印记（账号）
    if not re.match(r'^[a-zA-Z0-9_]{8,16}$', account):
        return jsonify(
            success=False,
            message="本命印记需8-16位，仅可包含字母、数字和下划线"
        )
    # 验证本命密钥（密码）
    if not re.match(r'^\S{1,20}$', password):
        return jsonify(
            success=False,
            message="本命密钥需1-20位，不可包含空格或特殊字符"
        )
    # 检查账号是否存在
    check_sql = "SELECT * FROM users WHERE user_account = %s"
    existing = db.fetch_one_record(check_sql, (account,))
    if existing:
        return jsonify(success=False, message="此本命印记已被他人炼化")
    # 插入数据库
    insert_sql = "INSERT INTO users (user_account, user_password) VALUES (%s, %s)"
    result = db.alter_data(insert_sql, (account, password))
    return jsonify(success=bool(result))

# 登录
def login(account,password):
    check_sql = "SELECT id,user_account,user_role,user_group FROM users WHERE user_account = %s AND user_password = %s"
    user = db.fetch_one_record(check_sql, (account, password))
    print(f"登录成功，用户信息：{user}")
    return user


# 用户查询

def get_user_by_id(user_id):
    try:
        result = db.fetch_one_record("SELECT user_role FROM users WHERE id = %s", (user_id,))
        if result:
            # 假设fetch_one_record返回的是元组，将其转换为字典
            columns = ['user_role']
            return dict(zip(columns, result))
        return None
    except Exception as e:
        print(f'用户查询异常：{str(e)}')
        return None

def get_db_connection():
    """获取数据库连接"""
    return db.connect()

def check_user_group(user_id):
    """检查用户所属用户组"""
    try:
        user_group = db.fetch_one_record("SELECT user_group FROM users WHERE id = %s", (user_id,))
        return user_group[0] if user_group else 1  # 默认返回普通用户组
    except Exception as e:
        logging.error(f"检查用户组出错: {str(e)}")
        return 1  # 出错时默认返回普通用户组



def get_videos_paginated(page=1, per_page=20, category='', user_group=1):
    """
    获取分页的视频列表（支持VIP权限验证）- 优先使用新表结构
    
    Args:
        page: 当前页码（从1开始）
        per_page: 每页显示数量
        category: 分类名称（可选）
        user_group: 用户权限组（1=普通用户，2=VIP用户）
    
    Returns:
        tuple: (总数量, 视频列表)
    """
    try:
        # 使用新表结构
        return get_videos_paginated_new(page, per_page, category, user_group)
                
    except Exception as e:
        print(f"获取分页视频列表失败: {str(e)}")
        raise

def get_video_categories():
    """获取所有视频分类"""
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取所有不重复的分类
                cursor.execute("""
                    SELECT DISTINCT category, COUNT(*) as video_count 
                    FROM video_info 
                    GROUP BY category 
                    ORDER BY video_count DESC
                """)
                
                categories = []
                for row in cursor.fetchall():
                    categories.append({
                        'name': row[0],
                        'count': row[1]
                    })
                
                return categories
                
    except Exception as e:
        print(f"获取视频分类失败: {str(e)}")
        raise

def search_videos_by_name(keyword, page=1, per_page=20, user_group=1):
    """
    按名称搜索视频，支持分页和VIP权限验证
    
    Args:
        keyword: 搜索关键词
        page: 页码，默认为1
        per_page: 每页数量，默认为20
        user_group: 用户权限组（1=普通用户，2=VIP用户）
    
    Returns:
        tuple: (符合条件的视频总数, 当前页的视频列表)
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 构建模糊查询 - 先获取符合条件的总数，添加权限过滤
                count_query = """
                    SELECT COUNT(*) 
                    FROM video_info 
                    WHERE video_name LIKE %s AND group_id <= %s
                """
                search_pattern = f'%{keyword}%'
                
                # 执行计数查询
                cursor.execute(count_query, (search_pattern, user_group))
                total_count = cursor.fetchone()[0]
                
                # 如果没有结果，直接返回
                if total_count == 0:
                    return 0, []
                
                # 构建分页查询，添加权限过滤
                search_query = """
                    SELECT id, category, video_path, video_name, video_duration, video_quality, group_id 
                    FROM video_info 
                    WHERE video_name LIKE %s AND group_id <= %s
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 执行分页查询
                cursor.execute(search_query, (search_pattern, user_group, per_page, offset))
                
                videos = []
                for row in cursor.fetchall():
                    videos.append({
                        'id': row[0],
                        'category': row[1],
                        'video_path': row[2],
                        'video_name': row[3],
                        'video_duration': row[4],
                        'video_quality': row[5],
                        'group_id': row[6],
                        'is_vip': row[6] > 1  # 添加VIP标识
                    })
                
                return total_count, videos
                
    except Exception as e:
        print(f"搜索视频失败: {str(e)}")
        raise

def clear_table():
    """清空视频表"""
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 清空新表结构
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                cursor.execute("TRUNCATE TABLE video_item")
                cursor.execute("TRUNCATE TABLE video_collection") 
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                
                conn.commit()
                
                return jsonify({"message": "视频表已清空", "status": "success"})
                
    except Exception as e:
        print(f"清空视频表失败: {str(e)}")
        return jsonify({"message": f"清空失败: {str(e)}", "status": "error"}), 500

def check_video_access(video_path, user_group=1):
    """
    检查用户是否有权限访问指定视频
    
    Args:
        video_path: 视频相对路径 (格式如: "分类名/视频文件名.mp4")
        user_group: 用户权限组（1=普通用户，2=VIP用户）
    
    Returns:
        bool: True表示有权限访问，False表示无权限
    """
    try:
        # 使用新表结构
        return check_video_access_new(video_path, user_group)
    
    except Exception as e:
        print("\n=== 检查视频访问权限出错 ===")
        print(f"错误类型: {type(e)}")
        print(f"错误信息: {str(e)}")
        print("错误堆栈:")
        traceback.print_exc()
        return False

def clear_audio_tables():
    """清空音频相关的数据表"""
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 清空audio_item表
                cursor.execute("DELETE FROM audio_item")
                
                # 清空audio_collection表
                cursor.execute("DELETE FROM audio_collection")
                
                conn.commit()
                
    except Exception as e:
        logging.error(f"清空音频表失败: {e}")
        raise

# 获取图片集列表（分页）
def get_image_collections_paginated(page=1, per_page=20, user_group=1):
    """
    分页获取图片集列表
    :param page: 页码
    :param per_page: 每页数量
    :param user_group: 用户组ID
    :return: (总数, 图片集列表)
    """
    try:
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 为提高性能记录查询开始时间
        start_time = time.time()
        
        # 构建查询条件 - 普通用户(1)只能看普通图片集(1)，高级用户可以看更多
        where_clause = ""
        params = []
        
        if user_group == 1:
            # 普通用户只能看到普通图片集(group_id = 1)
            where_clause = "WHERE c.group_id = 1"
        else:
            # VIP用户可以看到所有图片集
            where_clause = ""  # 不需要过滤，可以看所有图集
        
        # 计算总数 - 使用更简单的查询
        count_sql = f"""
            SELECT COUNT(*) FROM image_collection c {where_clause.replace('c.', '')}
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取总数
                cursor.execute(count_sql, params)
                total_count = cursor.fetchone()[0]
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 优化查询，避免使用子查询，使用LEFT JOIN和GROUP BY来获取第一张图片信息
                # 注意：为了提高性能，需要确保image_collection和image_item表上有适当的索引
                query_sql = f"""
                    SELECT 
                        c.collection_id,
                        c.collection_name,
                        c.group_id,
                        c.cover_id,
                        COUNT(i.image_id) AS image_count,
                        d.mount_path,
                        c.storage_root,
                        MIN(i.image_id) AS first_image_id,
                        MIN(i.relative_path) AS first_image_path
                    FROM 
                        image_collection c
                    LEFT JOIN 
                        storage_disk d ON c.disk_id = d.disk_id
                    LEFT JOIN 
                        image_item i ON c.collection_id = i.collection_id
                    {where_clause}
                    GROUP BY 
                        c.collection_id, c.collection_name, c.group_id, c.cover_id, d.mount_path, c.storage_root
                    ORDER BY 
                        c.collection_id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 获取分页数据
                query_params = params + [per_page, offset]
                cursor.execute(query_sql, query_params)
                rows = cursor.fetchall()
                
                cover_ids = []
                collections = []
                collection_map = {}
                
                # 处理查询结果
                for row in rows:
                    collection_id, collection_name, group_id, cover_id, image_count, mount_path, storage_root, first_image_id, first_image_path = row
                    
                    # 收集需要查询的封面图ID
                    if cover_id:
                        cover_ids.append(cover_id)
                    
                    # 初步处理数据
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'group_id': group_id,
                        'image_count': image_count,
                        'cover_id': cover_id,
                        'mount_path': mount_path,
                        'storage_root': storage_root,
                        'cover_path': None,
                        'first_image_id': first_image_id,
                        'first_image_path': first_image_path
                    }
                    
                    collections.append(collection_data)
                    collection_map[collection_id] = collection_data
                
                # 如果有需要查询的封面图，批量查询以减少数据库请求次数
                if cover_ids:
                    placeholders = ','.join(['%s'] * len(cover_ids))
                    cover_sql = f"""
                        SELECT image_id, relative_path 
                        FROM image_item 
                        WHERE image_id IN ({placeholders})
                    """
                    cursor.execute(cover_sql, cover_ids)
                    cover_results = cursor.fetchall()
                    
                    # 处理封面图结果
                    for image_id, relative_path in cover_results:
                        # 找到对应的集合
                        for collection in collections:
                            if collection['cover_id'] == image_id:
                                # 构建封面图路径
                                cover_path = f"/images/{collection['mount_path']}{collection['storage_root']}{relative_path}"
                                # 确保路径格式正确
                                cover_path = cover_path.replace('//', '/').replace('\\', '/')
                                collection['cover_path'] = cover_path
                                break
                
                # 处理没有封面图的情况
                for collection in collections:
                    # 如果没有指定封面图或封面图不存在，使用第一张图片
                    if not collection['cover_path'] and collection['first_image_path']:
                        cover_path = f"/images/{collection['mount_path']}{collection['storage_root']}{collection['first_image_path']}"
                        # 确保路径格式正确
                        cover_path = cover_path.replace('//', '/').replace('\\', '/')
                        collection['cover_path'] = cover_path
                
                # 记录查询执行时间
                end_time = time.time()
                print(f"图集列表查询用时: {end_time - start_time:.2f}秒，返回{len(collections)}条记录")
                
                return total_count, collections
    
    except Exception as e:
        print(f"获取图片集列表分页出错: {e}")
        print(traceback.format_exc())
        return 0, []

# 搜索图片集
def search_image_collections(keyword, page=1, per_page=20, user_group=1):
    """
    搜索图片集
    :param keyword: 搜索关键词
    :param page: 页码
    :param per_page: 每页数量
    :param user_group: 用户组ID
    :return: (总数, 图片集列表)
    """
    try:
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 为提高性能记录查询开始时间
        start_time = time.time()
        
        # 构建查询条件 - 普通用户(1)只能看普通图片集(1)，高级用户可以看所有图片集
        where_clause = "WHERE c.collection_name LIKE %s"
        params = [f"%{keyword}%"]
        
        if user_group == 1:
            # 普通用户只能看到普通图片集(group_id = 1)
            where_clause += " AND c.group_id = 1"
        # VIP用户不需要额外过滤，可以查看所有图集
        
        # 计算总数
        count_sql = f"""
            SELECT COUNT(*) 
            FROM image_collection c 
            {where_clause}
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取总数
                cursor.execute(count_sql, params)
                total_count = cursor.fetchone()[0]
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 优化查询，避免使用子查询
                query_sql = f"""
                    SELECT 
                        c.collection_id,
                        c.collection_name,
                        c.group_id,
                        c.cover_id,
                        COUNT(i.image_id) AS image_count,
                        d.mount_path,
                        c.storage_root,
                        MIN(i.image_id) AS first_image_id,
                        MIN(i.relative_path) AS first_image_path
                    FROM 
                        image_collection c
                    LEFT JOIN 
                        storage_disk d ON c.disk_id = d.disk_id
                    LEFT JOIN 
                        image_item i ON c.collection_id = i.collection_id
                    {where_clause}
                    GROUP BY 
                        c.collection_id, c.collection_name, c.group_id, c.cover_id, d.mount_path, c.storage_root
                    ORDER BY 
                        c.collection_id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 获取分页数据
                query_params = params + [per_page, offset]
                cursor.execute(query_sql, query_params)
                rows = cursor.fetchall()
                
                cover_ids = []
                collections = []
                collection_map = {}
                
                # 处理查询结果
                for row in rows:
                    collection_id, collection_name, group_id, cover_id, image_count, mount_path, storage_root, first_image_id, first_image_path = row
                    
                    # 收集需要查询的封面图ID
                    if cover_id:
                        cover_ids.append(cover_id)
                    
                    # 初步处理数据
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'group_id': group_id,
                        'image_count': image_count,
                        'cover_id': cover_id,
                        'mount_path': mount_path,
                        'storage_root': storage_root,
                        'cover_path': None,
                        'first_image_id': first_image_id,
                        'first_image_path': first_image_path
                    }
                    
                    collections.append(collection_data)
                    collection_map[collection_id] = collection_data
                
                # 如果有需要查询的封面图，批量查询以减少数据库请求次数
                if cover_ids:
                    placeholders = ','.join(['%s'] * len(cover_ids))
                    cover_sql = f"""
                        SELECT image_id, relative_path 
                        FROM image_item 
                        WHERE image_id IN ({placeholders})
                    """
                    cursor.execute(cover_sql, cover_ids)
                    cover_results = cursor.fetchall()
                    
                    # 处理封面图结果
                    for image_id, relative_path in cover_results:
                        # 找到对应的集合
                        for collection in collections:
                            if collection['cover_id'] == image_id:
                                # 构建封面图路径
                                cover_path = f"/images/{collection['mount_path']}{collection['storage_root']}{relative_path}"
                                # 确保路径格式正确
                                cover_path = cover_path.replace('//', '/').replace('\\', '/')
                                collection['cover_path'] = cover_path
                                break
                
                # 处理没有封面图的情况
                for collection in collections:
                    # 如果没有指定封面图或封面图不存在，使用第一张图片
                    if not collection['cover_path'] and collection['first_image_path']:
                        cover_path = f"/images/{collection['mount_path']}{collection['storage_root']}{collection['first_image_path']}"
                        # 确保路径格式正确
                        cover_path = cover_path.replace('//', '/').replace('\\', '/')
                        collection['cover_path'] = cover_path
                
                # 记录查询执行时间
                end_time = time.time()
                print(f"图集搜索查询用时: {end_time - start_time:.2f}秒，返回{len(collections)}条记录")
                
                return total_count, collections
    
    except Exception as e:
        print(f"搜索图片集出错: {e}")
        print(traceback.format_exc())
        return 0, []

# 获取图片集详情
def get_image_collection_by_id(collection_id, user_group=1):
    """
    通过ID获取图片集详情
    :param collection_id: 图片集ID
    :param user_group: 用户组ID
    :return: 图片集信息或None
    """
    try:
        # 判断用户权限
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 查询图片集的组ID
        check_query = """
            SELECT group_id FROM image_collection WHERE collection_id = %s
        """
        collection_group = db.fetch_one_record(check_query, (collection_id,))
        
        if not collection_group:
            print(f"图片集 {collection_id} 不存在")
            return None
            
        group_id = collection_group[0]
        
        # 判断用户是否有权限访问该图片集
        # 普通用户只能访问普通图片集(group_id=1)，VIP用户可以访问所有图片集
        if group_id > 1 and user_group < group_id:
            print(f"用户组 {user_group} 无权访问图片集 {collection_id}(组ID: {group_id})")
            return None
        
        # 获取图片集详细信息
        query_sql = """
            SELECT 
                c.collection_id,
                c.collection_name,
                c.storage_root,
                c.group_id,
                c.cover_id,
                d.mount_path,
                COUNT(i.image_id) AS image_count,
                (
                    SELECT MIN(ii.image_id) 
                    FROM image_item ii 
                    WHERE ii.collection_id = c.collection_id
                ) AS first_image_id,
                (
                    SELECT ii.relative_path 
                    FROM image_item ii 
                    WHERE ii.collection_id = c.collection_id 
                    ORDER BY ii.image_id ASC 
                    LIMIT 1
                ) AS first_image_path
            FROM 
                image_collection c
            JOIN 
                storage_disk d ON c.disk_id = d.disk_id
            LEFT JOIN 
                image_item i ON c.collection_id = i.collection_id
            WHERE 
                c.collection_id = %s
            GROUP BY 
                c.collection_id, c.collection_name, c.storage_root, c.group_id, c.cover_id, d.mount_path
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query_sql, (collection_id,))
                row = cursor.fetchone()
                
                if row:
                    collection_id, collection_name, storage_root, group_id, cover_id, mount_path, image_count, first_image_id, first_image_path = row
                    
                    # 确定封面图路径
                    cover_path = None
                    
                    # 如果存在指定的封面图ID，查询该图片
                    if cover_id:
                        cover_sql = """
                            SELECT relative_path 
                            FROM image_item 
                            WHERE image_id = %s
                        """
                        cursor.execute(cover_sql, (cover_id,))
                        cover_result = cursor.fetchone()
                        
                        if cover_result:
                            # 如果封面图存在，构建封面图路径
                            cover_relative_path = cover_result[0]
                            cover_path = f"/images/{mount_path}{storage_root}{cover_relative_path}"
                            # 确保路径格式正确
                            cover_path = cover_path.replace('//', '/').replace('\\', '/')
                    
                    # 如果没有指定封面图或封面图不存在，使用第一张图片
                    if not cover_path and first_image_path:
                        cover_path = f"/images/{mount_path}{storage_root}{first_image_path}"
                        # 确保路径格式正确
                        cover_path = cover_path.replace('//', '/').replace('\\', '/')
                    
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'storage_root': storage_root,
                        'group_id': group_id,
                        'cover_id': cover_id,
                        'mount_path': mount_path,
                        'image_count': image_count,
                        'cover_path': cover_path,
                        'first_image_id': first_image_id
                    }
                    print(f"返回图片集详细信息: {collection_data['collection_name']}")
                    return collection_data
                return None
    
    except Exception as e:
        print(f"获取图片集详情出错: {e}")
        print(traceback.format_exc())
        return None

# 获取图片集中的所有图片
def get_images_by_collection_id(collection_id, user_id=None):
    """
    获取图片集中的所有图片
    :param collection_id: 图片集ID
    :param user_id: 用户ID（可选）
    :return: 图片列表
    """
    try:
        # 查询图片集中的图片
        query_sql = """
            SELECT 
                i.image_id,
                i.relative_path,
                i.file_size,
                CONCAT(d.mount_path, c.storage_root, i.relative_path) AS full_path
            FROM 
                image_item i
            JOIN 
                image_collection c ON i.collection_id = c.collection_id
            JOIN 
                storage_disk d ON c.disk_id = d.disk_id
            WHERE 
                i.collection_id = %s
            ORDER BY 
                i.image_id
        """
        
        images = []
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query_sql, (collection_id,))
                rows = cursor.fetchall()
                
                print(f"为图片集{collection_id}查询到{len(rows)}张图片")
                
                for row in rows:
                    full_path = row[3]
                    # 确保路径中不包含重复的分隔符
                    full_path = full_path.replace('//', '/')
                    full_path = full_path.replace('\\\\', '\\')
                    
                    # 统一路径分隔符为正斜杠（适用于Web）
                    full_path = full_path.replace('\\', '/')
                    
                    # 移除路径开头的斜杠，防止路径出错
                    if full_path.startswith('/'):
                        full_path = full_path[1:]
                    
                    image_data = {
                        'image_id': row[0],
                        'relative_path': row[1],
                        'file_size': row[2],
                        'full_path': full_path
                    }
                    print(f"图片ID:{row[0]} 路径:{full_path}")
                    images.append(image_data)
        
        return images
    
    except Exception as e:
        logging.error(f"获取图片集图片列表出错: {e}")
        return {"error": f"获取图像时出错: {str(e)}"}

def get_audio_collections_paginated(page=1, per_page=20, user_group=1):
    """
    分页获取音频集列表
    :param page: 页码
    :param per_page: 每页数量
    :param user_group: 用户组ID
    :return: (总数, 音频集列表)
    """
    try:
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 构建查询条件
        where_clause = ""
        params = []
        
        if user_group == 1:
            # 普通用户只能看到普通音频集(group_id = 1)
            where_clause = "WHERE c.group_id = 1"
        
        # 计算总数
        count_sql = f"""
            SELECT COUNT(*) FROM audio_collection c {where_clause}
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取总数
                cursor.execute(count_sql, params)
                total_count = cursor.fetchone()[0]
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 查询音频集
                query_sql = f"""
                    SELECT 
                        c.collection_id,
                        c.collection_name,
                        c.group_id,
                        c.cover_path,
                        c.artist,
                        COUNT(a.audio_id) AS audio_count,
                        d.mount_path,
                        c.storage_root,
                        MIN(a.relative_path) AS first_track_path,
                        MIN(a.title) AS first_track_title
                    FROM 
                        audio_collection c
                    LEFT JOIN 
                        storage_disk d ON c.disk_id = d.disk_id
                    LEFT JOIN 
                        audio_item a ON c.collection_id = a.collection_id
                    {where_clause}
                    GROUP BY 
                        c.collection_id, c.collection_name, c.group_id, c.cover_path,
                        c.artist, d.mount_path, c.storage_root
                    ORDER BY 
                        c.collection_id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 获取分页数据
                query_params = params + [per_page, offset]
                cursor.execute(query_sql, query_params)
                rows = cursor.fetchall()
                
                collections = []
                for row in rows:
                    collection_id, collection_name, group_id, cover_path, artist, audio_count, mount_path, storage_root, first_track_path, first_track_title = row
                    
                    # 处理封面图路径
                    if cover_path:
                        cover_path = f"/images/{mount_path}{storage_root}{cover_path}"
                        cover_path = cover_path.replace('//', '/').replace('\\', '/')
                    else:
                        cover_path = "/static/images/default-album.jpg"
                    
                    # 创建第一首音频信息（用于封面提取）
                    first_track = None
                    if first_track_path:
                        first_track = {
                            'relative_path': first_track_path.replace('\\', '/'),
                            'title': first_track_title or '未知标题'
                        }
                    
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'group_id': group_id,
                        'cover_path': cover_path,
                        'artist': artist,
                        'audio_count': audio_count,
                        'first_track': first_track
                    }
                    collections.append(collection_data)
                
                return total_count, collections
    
    except Exception as e:
        logging.error(f"获取音频集列表分页出错: {e}")
        return 0, []

def search_audio_collections(keyword, page=1, per_page=20, user_group=1):
    """
    搜索音频集
    :param keyword: 搜索关键词
    :param page: 页码
    :param per_page: 每页数量
    :param user_group: 用户组ID
    :return: (总数, 音频集列表)
    """
    try:
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 构建查询条件
        where_clause = "WHERE (c.collection_name LIKE %s OR c.artist LIKE %s)"
        params = [f"%{keyword}%", f"%{keyword}%"]
        
        if user_group == 1:
            # 普通用户只能看到普通音频集(group_id = 1)
            where_clause += " AND c.group_id = 1"
        
        # 计算总数
        count_sql = f"""
            SELECT COUNT(*) FROM audio_collection c {where_clause}
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取总数
                cursor.execute(count_sql, params)
                total_count = cursor.fetchone()[0]
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 查询音频集
                query_sql = f"""
                    SELECT 
                        c.collection_id,
                        c.collection_name,
                        c.group_id,
                        c.cover_path,
                        c.artist,
                        COUNT(a.audio_id) AS audio_count,
                        d.mount_path,
                        c.storage_root,
                        MIN(a.relative_path) AS first_track_path,
                        MIN(a.title) AS first_track_title
                    FROM 
                        audio_collection c
                    LEFT JOIN 
                        storage_disk d ON c.disk_id = d.disk_id
                    LEFT JOIN 
                        audio_item a ON c.collection_id = a.collection_id
                    {where_clause}
                    GROUP BY 
                        c.collection_id, c.collection_name, c.group_id, c.cover_path,
                        c.artist, d.mount_path, c.storage_root
                    ORDER BY 
                        c.collection_id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 获取分页数据
                query_params = params + [per_page, offset]
                cursor.execute(query_sql, query_params)
                rows = cursor.fetchall()
                
                collections = []
                for row in rows:
                    collection_id, collection_name, group_id, cover_path, artist, audio_count, mount_path, storage_root, first_track_path, first_track_title = row
                    
                    # 处理封面图路径
                    if cover_path:
                        cover_path = f"/images/{mount_path}{storage_root}{cover_path}"
                        cover_path = cover_path.replace('//', '/').replace('\\', '/')
                    else:
                        cover_path = "/static/images/default-album.jpg"
                    
                    # 创建第一首音频信息（用于封面提取）
                    first_track = None
                    if first_track_path:
                        first_track = {
                            'relative_path': first_track_path.replace('\\', '/'),
                            'title': first_track_title or '未知标题'
                        }
                    
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'group_id': group_id,
                        'cover_path': cover_path,
                        'artist': artist,
                        'audio_count': audio_count,
                        'first_track': first_track
                    }
                    collections.append(collection_data)
                
                return total_count, collections
    
    except Exception as e:
        logging.error(f"搜索音频集出错: {e}")
        return 0, []

def get_audio_collection_by_id(collection_id, user_group=1):
    """
    通过ID获取音频集详情
    :param collection_id: 音频集ID
    :param user_group: 用户组ID
    :return: 音频集信息或None
    """
    try:
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 查询音频集的组ID
        check_query = """
            SELECT group_id FROM audio_collection WHERE collection_id = %s
        """
        collection_group = db.fetch_one_record(check_query, (collection_id,))
        
        if not collection_group:
            return None
            
        group_id = collection_group[0]
        
        # 判断用户是否有权限访问该音频集
        if group_id > 1 and user_group < group_id:
            return None
        
        # 获取音频集详细信息
        query_sql = """
            SELECT 
                c.collection_id,
                c.collection_name,
                c.storage_root,
                c.group_id,
                c.cover_path,
                c.artist,
                d.mount_path,
                COUNT(a.audio_id) AS audio_count
            FROM 
                audio_collection c
            JOIN 
                storage_disk d ON c.disk_id = d.disk_id
            LEFT JOIN 
                audio_item a ON c.collection_id = a.collection_id
            WHERE 
                c.collection_id = %s
            GROUP BY 
                c.collection_id, c.collection_name, c.storage_root, c.group_id,
                c.cover_path, c.artist, d.mount_path
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query_sql, (collection_id,))
                row = cursor.fetchone()
                
                if row:
                    collection_id, collection_name, storage_root, group_id, cover_path, artist, mount_path, audio_count = row
                    
                    # 处理封面图路径
                    if cover_path:
                        cover_path = f"/images/{mount_path}{storage_root}{cover_path}"
                        cover_path = cover_path.replace('\\', '/').replace('//', '/')
                    else:
                        cover_path = "/static/images/default-album.jpg"
                    
                    # 获取音频列表
                    audio_sql = """
                        SELECT 
                            audio_id,
                            relative_path,
                            file_size,
                            duration,
                            title,
                            artist,
                            album,
                            genre,
                            year
                        FROM 
                            audio_item
                        WHERE 
                            collection_id = %s
                        ORDER BY 
                            audio_id
                    """
                    cursor.execute(audio_sql, (collection_id,))
                    audio_rows = cursor.fetchall()
                    
                    audio_list = []
                    for audio_row in audio_rows:
                        audio_id, relative_path, file_size, duration, title, artist, album, genre, year = audio_row
                        
                        # 标准化路径
                        relative_path = relative_path.replace('\\', '/')
                        
                        # 移除重复的路径部分
                        if relative_path.startswith('Audios/'):
                            relative_path = relative_path[7:]
                        
                        audio_data = {
                            'audio_id': audio_id,
                            'relative_path': relative_path,  # 只保留相对路径
                            'file_size': file_size,
                            'duration': duration,
                            'title': title or os.path.splitext(os.path.basename(relative_path))[0],
                            'artist': artist,
                            'album': album,
                            'genre': genre,
                            'year': year
                        }
                        audio_list.append(audio_data)
                    
                    collection_data = {
                        'collection_id': collection_id,
                        'collection_name': collection_name,
                        'storage_root': storage_root,
                        'group_id': group_id,
                        'cover_path': cover_path,
                        'artist': artist,
                        'audio_count': audio_count,
                        'tracks': audio_list
                    }
                    return collection_data
                return None
    
    except Exception as e:
        logging.error(f"获取音频集详情出错: {e}")
        return None

def check_audio_access(file_path, user_group=1):
    """
    检查用户是否有权限访问指定的音频文件（修复版：支持多目录映射）
    :param file_path: 音频文件路径
    :param user_group: 用户组ID
    :return: bool
    """
    try:
        print("\n=== 检查音频访问权限 ===")
        print(f"文件路径: {file_path}")
        print(f"用户组: {user_group}")
        
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        
        # 标准化路径
        file_path = file_path.replace('\\', '/').replace('//', '/')
        print(f"标准化后的路径: {file_path}")
        
        # 🎯 修复：支持多种路径格式，不再硬编码Audios前缀
        search_patterns = [
            f"%{file_path}%",  # 直接匹配
            f"%Audios/{file_path}%",  # 兼容旧格式
            f"%{file_path.split('/')[-1]}%"  # 只匹配文件名
        ]
        print(f"搜索模式: {search_patterns}")
        
        # 查询音频所属集合的权限组
        query_sql = """
            SELECT c.group_id, a.relative_path
            FROM audio_item a
            JOIN audio_collection c ON a.collection_id = c.collection_id
            WHERE a.relative_path LIKE %s
            LIMIT 1
        """
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                result = None
                used_pattern = None
                
                # 依次尝试不同的搜索模式
                for pattern in search_patterns:
                    cursor.execute(query_sql, (pattern,))
                    result = cursor.fetchone()
                    if result:
                        used_pattern = pattern
                        print(f"✅ 找到匹配，使用模式: {pattern}")
                        break
                
                print(f"数据库查询结果: {result}")
                
                if not result:
                    print("❌ 未找到匹配的音频文件")
                    return False
                
                group_id = result[0]
                db_path = result[1]
                print(f"音频组ID: {group_id}")
                print(f"数据库中的路径: {db_path}")
                
                # 普通用户只能访问普通音频(group_id=1)，VIP用户可以访问所有音频
                has_access = group_id <= user_group
                print(f"访问权限检查结果: {has_access}")
                return has_access
    
    except Exception as e:
        print("\n=== 检查音频访问权限出错 ===")
        print(f"错误类型: {type(e)}")
        print(f"错误信息: {str(e)}")
        print("错误堆栈:")
        traceback.print_exc()
        return False








def get_audio_config():
    """获取音频配置（已废弃，保留兼容性）"""
    try:
        # 新系统不需要这些配置，直接返回空配置
        return {'audio_base': ''}
    except Exception as e:
        print(f'获取音频配置异常：{str(e)}')
        return None


def save_audio_config(audio_base):
    """保存音频配置到环境变量（已废弃，保留兼容性）"""
    try:
        # 新系统不需要这些配置，直接返回成功
        return {'status': 'success', 'message': '音频配置保存成功（新系统已不需要此配置）'}
            
    except Exception as e:
        print(f'保存音频配置异常：{str(e)}')
        return {'status': 'error', 'message': str(e)}



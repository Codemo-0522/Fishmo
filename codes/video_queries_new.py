from codes.connect_mysql import Connect_mysql
from pathlib import Path

db = Connect_mysql()

def smart_fix_video_path(relative_path):
    """
    智能修复视频路径前缀
    
    Args:
        relative_path: 原始相对路径，如 "Videos/陈圆圆/video.mp4"
    
    Returns:
        tuple: (clean_relative_path, video_path, video_play_url)
    """
    if relative_path.startswith('Videos/') and '/' in relative_path[7:]:
        # 只在嵌套时去掉 "Videos/" 前缀
        clean_relative_path = relative_path[7:]
    else:
        # 根目录情况保持不变
        clean_relative_path = relative_path
    
    # 计算 video_path (用于兼容性)
    video_path = str(Path(clean_relative_path).parent) if clean_relative_path != Path(clean_relative_path).name else ""
    
    # 生成完整的播放URL
    video_play_url = f"/videos/{clean_relative_path}"
    
    return clean_relative_path, video_path, video_play_url

def insert_video_collection(disk_id, collection_name, storage_root, group_id=1, description=None, 
                           thumbnail_disk_id=None, thumbnail_root=None):
    """
    插入新的视频集合
    
    Args:
        disk_id: 磁盘ID
        collection_name: 集合名称（分类名）
        storage_root: 存储根路径（相对于磁盘挂载点）
        group_id: 权限组ID（1=普通，2=VIP）
        description: 描述信息
        thumbnail_disk_id: 缩略图磁盘ID（可选）
        thumbnail_root: 缩略图根路径（可选）
    
    Returns:
        int: 新建集合的ID，失败返回None
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO video_collection 
                    (disk_id, collection_name, storage_root, group_id, description, 
                     thumbnail_disk_id, thumbnail_root)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    group_id = VALUES(group_id),
                    description = VALUES(description),
                    thumbnail_disk_id = VALUES(thumbnail_disk_id),
                    thumbnail_root = VALUES(thumbnail_root),
                    update_time = CURRENT_TIMESTAMP(3)
                """, (disk_id, collection_name, storage_root, group_id, description, 
                      thumbnail_disk_id, thumbnail_root))
                
                # 获取插入或更新的集合ID
                cursor.execute("SELECT LAST_INSERT_ID()")
                result = cursor.fetchone()
                collection_id = result[0]
                
                # 如果LAST_INSERT_ID()返回0，说明是更新操作，需要查询实际ID
                if collection_id == 0:
                    cursor.execute("""
                        SELECT collection_id FROM video_collection 
                        WHERE disk_id = %s AND collection_name = %s
                    """, (disk_id, collection_name))
                    result = cursor.fetchone()
                    collection_id = result[0] if result else None
                
                conn.commit()
                return collection_id
                
    except Exception as e:
        print(f'插入视频集合异常：{str(e)}')
        return None

def insert_video_item(collection_id, relative_path, video_name, file_size=None, 
                     video_duration=None, video_quality=None, video_width=None, 
                     video_height=None, video_bitrate=None, video_fps=None, 
                     video_codec=None, thumbnail_path=None):
    """
    插入新的视频条目
    
    Args:
        collection_id: 所属集合ID
        relative_path: 相对路径（含文件名）
        video_name: 视频文件名
        其他参数: 视频元信息
    
    Returns:
        bool: 插入是否成功
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO video_item 
                    (collection_id, relative_path, video_name, file_size, 
                     video_duration, video_quality, video_width, video_height, 
                     video_bitrate, video_fps, video_codec, thumbnail_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    video_name = VALUES(video_name),
                    file_size = VALUES(file_size),
                    video_duration = VALUES(video_duration),
                    video_quality = VALUES(video_quality),
                    video_width = VALUES(video_width),
                    video_height = VALUES(video_height),
                    video_bitrate = VALUES(video_bitrate),
                    video_fps = VALUES(video_fps),
                    video_codec = VALUES(video_codec),
                    thumbnail_path = VALUES(thumbnail_path),
                    update_time = CURRENT_TIMESTAMP(3)
                """, (collection_id, relative_path, video_name, file_size, 
                      video_duration, video_quality, video_width, video_height, 
                      video_bitrate, video_fps, video_codec, thumbnail_path))
                conn.commit()
                return True
                
    except Exception as e:
        print(f'插入视频条目异常：{str(e)}')
        return False

def get_videos_paginated_new(page=1, per_page=20, category='', user_group=1):
    """
    获取分页的视频列表（新表结构版本）
    
    Args:
        page: 当前页码（从1开始）
        per_page: 每页显示数量
        category: 分类名称（可选）
        user_group: 用户权限组（1=普通用户，2=VIP用户）
    
    Returns:
        tuple: (总数量, 视频列表)
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 构建基础查询，添加权限过滤
                base_query = """
                    FROM video_item vi
                    JOIN video_collection vc ON vi.collection_id = vc.collection_id
                    JOIN storage_disk sd ON vc.disk_id = sd.disk_id
                    WHERE vc.group_id <= %s
                """
                
                count_query = "SELECT COUNT(*) " + base_query
                data_query = """
                    SELECT 
                        vi.video_id,
                        vc.collection_name as category,
                        CONCAT(sd.mount_path, vc.storage_root, '/', vi.relative_path) as full_path,
                        vi.relative_path,
                        vi.video_name,
                        vi.video_duration,
                        vi.video_quality,
                        vc.group_id,
                        vi.file_size,
                        vi.video_width,
                        vi.video_height,
                        vi.thumbnail_path
                """ + base_query
                
                # 参数列表，第一个参数是user_group
                params = [user_group]
                
                # 如果指定了分类，添加WHERE条件
                if category:
                    count_query += " AND vc.collection_name = %s"
                    data_query += " AND vc.collection_name = %s"
                    params.append(category)
                
                # 获取总数
                cursor.execute(count_query, params)
                total_count = cursor.fetchone()[0]
                
                # 添加分页
                data_query += " ORDER BY vi.video_id DESC LIMIT %s OFFSET %s"
                offset = (page - 1) * per_page
                params.extend([per_page, offset])
                
                # 获取数据
                cursor.execute(data_query, params)
                videos = []
                for row in cursor.fetchall():
                    # 构建缩略图路径 - 修复版
                    if row[11]:  # thumbnail_path 存在
                        thumbnail_url = f"/thumbnails/{row[11]}"
                    else:
                        # 生成默认缩略图路径 - 修复路径构建逻辑
                        video_relative_path = row[3]  # 例如: "分类1/video1.mp4"
                        video_name = row[4]           # 例如: "video1.mp4"
                        video_name_no_ext = Path(video_name).stem  # 例如: "video1"
                        
                        # 构建缩略图相对路径：目录保持不变，只替换文件名
                        video_path_obj = Path(video_relative_path)
                        thumbnail_relative_path = video_path_obj.parent / f"{video_name_no_ext}.jpg"
                        thumbnail_url = f"/thumbnails/{thumbnail_relative_path}"
                    
                    videos.append({
                        'id': row[0],
                        'category': row[1],
                        'video_path': str(Path(row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]).parent) if (row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]) != Path(row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]).name else "",  # 智能修复路径前缀
                        'video_name': row[4],
                        'video_duration': row[5],
                        'video_quality': row[6],
                        'group_id': row[7],
                        'is_vip': row[7] > 1,
                        'file_size': row[8],
                        'video_width': row[9],
                        'video_height': row[10],
                        'thumbnail_url': thumbnail_url,
                        'full_path': row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3],  # 智能修复：只在嵌套情况下去掉Videos前缀
                        'relative_path': row[3]  # 相对路径
                    })
                
                return total_count, videos
                
    except Exception as e:
        print(f"获取视频列表失败: {str(e)}")
        raise

def get_video_categories_new():
    """
    获取所有视频分类（新表结构版本）
    
    Returns:
        list: 分类列表
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        vc.collection_name,
                        COUNT(vi.video_id) as video_count,
                        vc.group_id,
                        vc.description
                    FROM video_collection vc
                    LEFT JOIN video_item vi ON vc.collection_id = vi.collection_id
                    GROUP BY vc.collection_id, vc.collection_name, vc.group_id, vc.description
                    ORDER BY vc.collection_name
                """)
                
                categories = []
                for row in cursor.fetchall():
                    categories.append({
                        'name': row[0],
                        'count': row[1],  # 修改为前端期望的字段名
                        'video_count': row[1],  # 保留兼容性
                        'group_id': row[2],
                        'is_vip': row[2] > 1,
                        'description': row[3]
                    })
                
                return categories
                
    except Exception as e:
        print(f"获取视频分类失败: {str(e)}")
        raise

def search_videos_by_name_new(keyword, page=1, per_page=20, user_group=1):
    """
    按名称搜索视频（新表结构版本）
    
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
                    FROM video_item vi
                    JOIN video_collection vc ON vi.collection_id = vc.collection_id
                    WHERE vi.video_name LIKE %s AND vc.group_id <= %s
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
                    SELECT 
                        vi.video_id,
                        vc.collection_name as category,
                        CONCAT(sd.mount_path, vc.storage_root, '/', vi.relative_path) as full_path,
                        vi.relative_path,
                        vi.video_name,
                        vi.video_duration,
                        vi.video_quality,
                        vc.group_id,
                        vi.file_size,
                        vi.video_width,
                        vi.video_height,
                        vi.thumbnail_path
                    FROM video_item vi
                    JOIN video_collection vc ON vi.collection_id = vc.collection_id
                    JOIN storage_disk sd ON vc.disk_id = sd.disk_id
                    WHERE vi.video_name LIKE %s AND vc.group_id <= %s
                    ORDER BY vi.video_id DESC
                    LIMIT %s OFFSET %s
                """
                
                # 计算偏移量
                offset = (page - 1) * per_page
                
                # 执行分页查询
                cursor.execute(search_query, (search_pattern, user_group, per_page, offset))
                
                videos = []
                for row in cursor.fetchall():
                    # 构建缩略图路径 - 修复版
                    if row[11]:  # thumbnail_path 存在
                        thumbnail_url = f"/thumbnails/{row[11]}"
                    else:
                        # 生成默认缩略图路径 - 修复路径构建逻辑
                        video_relative_path = row[3]  # 例如: "分类1/video1.mp4"
                        video_name = row[4]           # 例如: "video1.mp4"
                        video_name_no_ext = Path(video_name).stem  # 例如: "video1"
                        
                        # 构建缩略图相对路径：目录保持不变，只替换文件名
                        video_path_obj = Path(video_relative_path)
                        thumbnail_relative_path = video_path_obj.parent / f"{video_name_no_ext}.jpg"
                        thumbnail_url = f"/thumbnails/{thumbnail_relative_path}"
                    
                    videos.append({
                        'id': row[0],
                        'category': row[1],
                        'video_path': str(Path(row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]).parent) if (row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]) != Path(row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3]).name else "",  # 智能修复路径前缀
                        'video_name': row[4],
                        'video_duration': row[5],
                        'video_quality': row[6],
                        'group_id': row[7],
                        'is_vip': row[7] > 1,
                        'file_size': row[8],
                        'video_width': row[9],
                        'video_height': row[10],
                        'thumbnail_url': thumbnail_url,
                        'full_path': row[3][7:] if row[3].startswith('Videos/') and '/' in row[3][7:] else row[3],  # 智能修复：只在嵌套情况下去掉Videos前缀
                        'relative_path': row[3]  # 相对路径
                    })
                
                return total_count, videos
                
    except Exception as e:
        print(f"搜索视频失败: {str(e)}")
        raise

def check_video_access_new(video_path, user_group=1):
    """
    检查用户是否有权限访问指定视频（新表结构版本）
    
    Args:
        video_path: 视频路径（可能是相对路径或文件名）
        user_group: 用户权限组（1=普通用户，2=VIP用户）
    
    Returns:
        bool: 是否有访问权限
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 尝试多种匹配方式
                queries = [
                    # 1. 精确匹配相对路径
                    """
                        SELECT vc.group_id 
                        FROM video_item vi
                        JOIN video_collection vc ON vi.collection_id = vc.collection_id
                        WHERE vi.relative_path = %s
                        LIMIT 1
                    """,
                    # 2. 匹配文件名
                    """
                        SELECT vc.group_id 
                        FROM video_item vi
                        JOIN video_collection vc ON vi.collection_id = vc.collection_id
                        WHERE vi.video_name = %s
                        LIMIT 1
                    """,
                    # 3. 模糊匹配
                    """
                        SELECT vc.group_id 
                        FROM video_item vi
                        JOIN video_collection vc ON vi.collection_id = vc.collection_id
                        WHERE vi.relative_path LIKE %s OR vi.video_name LIKE %s
                        LIMIT 1
                    """
                ]
                
                # 尝试第一种查询
                cursor.execute(queries[0], (video_path,))
                result = cursor.fetchone()
                
                if not result:
                    # 提取文件名进行第二种查询
                    filename = Path(video_path).name
                    cursor.execute(queries[1], (filename,))
                    result = cursor.fetchone()
                
                if not result:
                    # 模糊匹配查询
                    pattern = f"%{Path(video_path).name}%"
                    cursor.execute(queries[2], (pattern, pattern))
                    result = cursor.fetchone()
                
                if not result:
                    return False
                
                group_id = result[0]
                # 普通用户只能访问普通视频(group_id=1)，VIP用户可以访问所有视频
                has_access = group_id <= user_group
                return has_access
    
    except Exception as e:
        print(f"检查视频访问权限失败: {str(e)}")
        return False



def clear_video_tables_new():
    """
    清空新的视频表
    
    Returns:
        dict: 操作结果
    """
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 临时禁用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                
                # 清空视频条目表
                cursor.execute("TRUNCATE TABLE video_item")
                
                # 清空视频集合表
                cursor.execute("TRUNCATE TABLE video_collection")
                
                # 重新启用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                
                conn.commit()
                
                return {"status": "success", "message": "视频数据表已清空"}
                
    except Exception as e:
        print(f"清空视频表异常: {str(e)}")
        return {"status": "error", "message": f"清空视频表失败: {str(e)}"}

def get_or_create_disk(mount_path, disk_drive=None):
    """
    获取或创建磁盘记录
    
    Args:
        mount_path: 挂载路径
        disk_drive: 磁盘盘符（可选，会自动从路径提取）
    
    Returns:
        int: 磁盘ID，失败返回None
    """
    try:
        if disk_drive is None:
            # 自动从路径提取盘符
            path_obj = Path(mount_path)
            if path_obj.is_absolute() and len(str(path_obj)) >= 3:
                disk_drive = str(path_obj)[0].upper()
            else:
                disk_drive = 'C'  # 默认值
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 先尝试查找现有记录
                cursor.execute("""
                    SELECT disk_id FROM storage_disk 
                    WHERE mount_path = %s
                """, (mount_path,))
                result = cursor.fetchone()
                
                if result:
                    return result[0]
                
                # 创建新记录
                cursor.execute("""
                    INSERT INTO storage_disk (disk_drive, mount_path, is_active)
                    VALUES (%s, %s, 1)
                """, (disk_drive, mount_path))
                
                cursor.execute("SELECT LAST_INSERT_ID()")
                result = cursor.fetchone()
                conn.commit()
                
                return result[0] if result else None
                
    except Exception as e:
        print(f"获取或创建磁盘记录失败: {str(e)}")
        return None
from codes import connect_mysql
from codes import function
import os
from flask import jsonify
import re

# 数据库连接实例
db=connect_mysql.Connect_mysql()

def save_video_config(video_base, thumbnail_base):
    """保存视频和缩略图根路径配置"""
    try:
        # 检查路径是否存在
        if not os.path.exists(video_base):
            return {'status': 'error', 'message': '视频根路径不存在'}
        if not os.path.exists(thumbnail_base):
            return {'status': 'error', 'message': '缩略图根路径不存在'}
            
        # 更新配置
        sql = """
            INSERT INTO config (video_base, thumbnail_base) 
            VALUES (%s, %s) 
            ON DUPLICATE KEY UPDATE 
            video_base = VALUES(video_base), 
            thumbnail_base = VALUES(thumbnail_base)
        """
        result = db.alter_data(sql, (video_base, thumbnail_base))
        
        if result:
            return {'status': 'success', 'message': '配置保存成功'}
        else:
            return {'status': 'error', 'message': '配置保存失败'}
            
    except Exception as e:
        print(f'保存视频配置异常：{str(e)}')
        return {'status': 'error', 'message': str(e)}

def insert_video_info(category, video_path, video_name):
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 直接插入，依赖数据库自动管理时间戳
                cursor.execute("""
                    INSERT INTO video_info (category, video_path, video_name)
                    VALUES (%s, %s, %s)
                """, (category, video_path, video_name))
                conn.commit()
                return True
    except Exception as e:
        print(f'数据库插入异常：{str(e)}')
        return False

def update_video_config(video_base, thumbnail_base):
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE config SET video_base = %s, thumbnail_base = %s",
                               (video_base, thumbnail_base))
                conn.commit()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, message=str(e))

def get_video_config():
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                #获取最后一条的记录
                cursor.execute("SELECT video_base, thumbnail_base FROM config ORDER BY id DESC LIMIT 1")
                result = cursor.fetchone()
                if result:
                    print(f"返回视频一级路径：{result[0]} 返回缩略图一级路径：{result[1]}")
                    return {'video_base': result[0], 'thumbnail_base': result[1]}
                return None
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
    check_sql = "SELECT * FROM users WHERE user_account = %s AND user_password = %s"
    user = db.fetch_one_record(check_sql, (account, password))
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
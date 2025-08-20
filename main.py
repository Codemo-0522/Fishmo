import os
from datetime import timedelta
from flask import Flask, render_template, send_from_directory, url_for, request, jsonify, session, Response, abort, redirect
from codes import query_database
from functools import wraps
import json
import time
import logging
from pathlib import Path
import threading
from codes.video_queries_new import db
from codes import function as fun
from codes.video_scan_new import scan_and_process_videos_new
from codes.video_queries_new import get_videos_paginated_new
from codes.video_queries_new import get_video_categories_new
from codes.video_queries_new import search_videos_by_name_new
from codes.video_scan_new import migrate_from_old_videos
import traceback
from codes import connect_mysql
import re
from codes.audio_processor import AudioProcessor

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 配置常量 ============================================>
app.secret_key = fun.get_app_secret_key()
app.config.update({
    'DEFAULT_THUMB_PATH': 'images/default.jpg'
})
# 配置会话持久化时间（例如7天）
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# 全局变量用于存储进度信息 ============================================>
# 使用线程锁保证线程安全
progress_lock = threading.Lock()

scan_progress = {
    'percentage': 0,
    'current_file': '',
    'type': None
}

image_scan_progress = {
    'percentage': 0,
    'current_file': '',
    'total': 0,
    'current': 0
}
# 🎯 音频扫描进度变量
audio_scan_progress = {
    'percentage': 0,
    'current_file': ''
}

def update_scan_progress(percentage, current_file):
    global scan_progress
    # 确保百分比在有效范围内且只能增加
    percentage = max(0, min(100, percentage))
    if percentage >= scan_progress['percentage'] or percentage == 0:
        scan_progress['percentage'] = percentage
        scan_progress['current_file'] = current_file
        print(f"🔄 视频扫描进度更新: {percentage}% - {current_file}")
        print(f"📊 视频扫描全局进度状态: {scan_progress}")



def update_image_scan_progress(percentage, current_file, current, total):
    global image_scan_progress, progress_lock
    # 确保百分比在有效范围内
    percentage = max(0, min(100, percentage))
    
    with progress_lock:
        # 允许重置进度（percentage == 0）或者进度递增
        if percentage == 0 or percentage >= image_scan_progress['percentage']:
            image_scan_progress['percentage'] = percentage
            image_scan_progress['current_file'] = current_file
            image_scan_progress['current'] = current
            image_scan_progress['total'] = total
            print(f"🔄 进度更新: {percentage}% - {current_file} ({current}/{total})")
            print(f"📊 全局进度状态更新: {image_scan_progress}")

# 🎯 音频扫描进度更新函数
def update_audio_scan_progress(percentage, current_file):
    global audio_scan_progress
    # 确保百分比在有效范围内
    percentage = max(0, min(100, percentage))
    
    with progress_lock:
        # 允许重置进度（percentage == 0）或者进度递增
        if percentage == 0 or percentage >= audio_scan_progress['percentage']:
            audio_scan_progress['percentage'] = percentage
            audio_scan_progress['current_file'] = current_file
            print(f"🔄 音频扫描进度更新: {percentage}% - {current_file}")
            print(f"📊 音频扫描全局进度状态: {audio_scan_progress}")

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video')
def video_page():
    with app.app_context():
        default_thumb = url_for('static', filename=app.config['DEFAULT_THUMB_PATH'])
    return render_template('video.html', default_thumb=default_thumb)

@app.route('/videos/<path:filename>')
def serve_video(filename):
    """提供视频文件服务（支持VIP权限验证和新表结构）"""
    try:
        # 获取当前用户权限组
        user_group = session.get('user_group', 1)
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
        
        # 检查用户是否有权限访问该视频
        if not query_database.check_video_access(filename, user_group):
            print(f"用户组({user_group})无权限访问视频: {filename}")
            abort(403)  # 返回403 Forbidden而不是404
        
        # 尝试从新表结构获取视频路径（参考图片模块的正确实现）
        try:
            with db.connect() as conn:
                with conn.cursor() as cursor:
                    # 检查新表是否有数据
                    cursor.execute("SELECT COUNT(*) FROM video_item")
                    new_table_count = cursor.fetchone()[0]
                    
                    if new_table_count > 0:
                        # 参考图片模块的查询方式
                        query_sql = """
                            SELECT 
                                sd.mount_path,
                                vc.storage_root,
                                vi.relative_path,
                                vc.group_id
                            FROM video_item vi
                            JOIN video_collection vc ON vi.collection_id = vc.collection_id
                            JOIN storage_disk sd ON vc.disk_id = sd.disk_id
                            WHERE vi.relative_path LIKE %s
                            LIMIT 1
                        """
                        
                        # 提取和处理路径组件（参考图片模块）
                        path_obj = Path(filename)
                        relative_path = str(path_obj).replace('\\', '/')  # 标准化路径
                        
                        # 移除路径前面的斜杠
                        if relative_path.startswith('/'):
                            relative_path = relative_path[1:]
                        
                        # 尝试多种搜索模式
                        search_patterns = [
                            f'%{filename}%',
                            f'%{path_obj.name}%'
                        ]
                        
                        video_info = None
                        for pattern in search_patterns:
                            cursor.execute(query_sql, (pattern,))
                            video_info = cursor.fetchone()
                            if video_info:
                                print(f"使用模式 '{pattern}' 找到视频")
                                break
                        
                        if video_info:
                            mount_path = video_info[0]        # 例如 "C:\"
                            storage_root = video_info[1]      # 例如 "Users/Administrator/Videos/"  
                            relative_path = video_info[2]     # 例如 "陈圆圆/video.mp4"
                            group_id = video_info[3]
                            
                            # 构建完整路径（参考图片模块）
                            full_path = os.path.join(mount_path, storage_root, relative_path)
                            full_path = Path(full_path).resolve()
                            
                            print(f"视频路径拼接:")
                            print(f"  挂载路径: '{mount_path}'")
                            print(f"  存储根: '{storage_root}'")
                            print(f"  相对路径: '{relative_path}'")
                            print(f"  完整路径: {full_path}")
                            
                            if full_path.exists() and full_path.is_file():
                                print(f"提供视频文件: {full_path}")
                                return send_from_directory(str(full_path.parent), full_path.name)
                            else:
                                print(f"新表中的视频文件不存在: {full_path}")
        except Exception as e:
            print(f"视频文件服务错误: {str(e)}")
            abort(404)
        
    except Exception as e:
        print(f"视频访问错误: {str(e)}")
        abort(404)

@app.route('/thumbnails/<path:filename>')
def serve_thumbnail(filename):
    """提供缩略图文件服务（支持新的缩略图自动映射）"""
    try:
        print(f"请求缩略图: {filename}")
        
        # 首先尝试从新表结构查找缩略图
        try:
            with db.connect() as conn:
                with conn.cursor() as cursor:
                    # 精确查找缩略图对应的视频记录
                    filename_name = Path(filename).name  # 例如: video1.jpg
                    filename_stem = Path(filename).stem  # 例如: video1
                    
                    print(f"查找缩略图对应视频: filename_name={filename_name}, filename_stem={filename_stem}")
                    
                    cursor.execute("""
                        SELECT 
                            sd_thumb.mount_path as thumb_mount,
                            vc.thumbnail_root,
                            vi.thumbnail_path,
                            sd_video.mount_path as video_mount,
                            vc.storage_root,
                            vi.relative_path,
                            vi.video_name
                        FROM video_item vi
                        JOIN video_collection vc ON vi.collection_id = vc.collection_id
                        JOIN storage_disk sd_video ON vc.disk_id = sd_video.disk_id
                        LEFT JOIN storage_disk sd_thumb ON vc.thumbnail_disk_id = sd_thumb.disk_id
                        WHERE vi.thumbnail_path = %s 
                           OR (vi.thumbnail_path IS NULL AND vi.video_name = %s)
                           OR (vi.thumbnail_path IS NULL AND vi.video_name LIKE %s)
                        ORDER BY 
                            CASE 
                                WHEN vi.thumbnail_path = %s THEN 1
                                WHEN vi.video_name = %s THEN 2
                                ELSE 3
                            END
                        LIMIT 1
                    """, (
                        filename,  # 精确匹配thumbnail_path
                        f"{filename_stem}.mp4",  # 精确匹配video_name (最常见格式)
                        f"{filename_stem}.%",   # 模糊匹配 video_name（不同扩展名）
                        filename,  # 排序用
                        f"{filename_stem}.mp4"  # 排序用
                    ))
                    
                    video_info = cursor.fetchone()
                    if video_info:
                        thumb_mount = video_info[0]
                        thumbnail_root = video_info[1] 
                        thumbnail_path = video_info[2]
                        video_mount = video_info[3]
                        storage_root = video_info[4]
                        video_relative_path = video_info[5]
                        video_name = video_info[6]
                        
                        # 如果有缩略图配置，使用配置的路径
                        if thumb_mount and thumbnail_root and thumbnail_path:
                            thumbnail_full_path = Path(thumb_mount) / thumbnail_root / thumbnail_path
                            print(f"使用配置的缩略图路径: {thumbnail_full_path}")
                        else:
                            # 回退到传统方式（与视频同目录）
                            video_full_path = Path(video_mount) / storage_root / video_relative_path
                            thumbnail_full_path = video_full_path.parent / f"{Path(video_name).stem}.jpg"
                            print(f"使用传统缩略图路径: {thumbnail_full_path}")
                        
                        # 检查缩略图是否存在
                        if thumbnail_full_path.exists():
                            print(f"找到缩略图: {thumbnail_full_path}")
                            return send_from_directory(str(thumbnail_full_path.parent), thumbnail_full_path.name)
                        else:
                            print(f"缩略图不存在，尝试生成: {thumbnail_full_path}")
                            
                            # 确保缩略图目录存在
                            thumbnail_full_path.parent.mkdir(parents=True, exist_ok=True)
                            
                            # 生成缩略图
                            video_full_path = Path(video_mount) / storage_root / video_relative_path
                            if video_full_path.exists():
                                if fun.generate_thumbnail(str(video_full_path), str(thumbnail_full_path)):
                                    print(f"缩略图生成成功: {thumbnail_full_path}")
                                    return send_from_directory(str(thumbnail_full_path.parent), thumbnail_full_path.name)
                                else:
                                    print(f"缩略图生成失败")
                    else:
                        print(f"新表中未找到对应视频: {filename}")
        except Exception as e:
            print(f"缩略图服务错误: {str(e)}")
            return send_from_directory(app.static_folder, app.config['DEFAULT_THUMB_PATH'])

    except Exception as e:
        print(f"缩略图处理异常: {str(e)}")
        return send_from_directory(app.static_folder, app.config['DEFAULT_THUMB_PATH'])

@app.route('/image')
def image_page():
    with app.app_context():
        default_thumb = url_for('static', filename=app.config['DEFAULT_THUMB_PATH'])
    return render_template('image.html', default_thumb=default_thumb)

@app.route('/show_image')
def show_image():
    collection_id = request.args.get('id')
    if not collection_id:
        return redirect(url_for('image_page'))
    return render_template('show_image.html', collection_id=collection_id)

@app.route('/audio')
def audio_page():
    return render_template('audio.html')


# ====================================================
# 注册
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    account = data.get('account')
    password = data.get('password')
    res=query_database.register(account,password)
    return res


# 登录
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    account = data.get('account')
    password = data.get('password')
    user=query_database.login(account,password)
    if user:
        session['user_id'] = user[0]
        session['user_account'] = user[1]
        session['user_role']=user[2]
        session['user_group']=user[3]
        print(f"登录成功！保存到Session的用户数据：\n用户id：{user[0]}\n用户账号：{user[1]}\n用户角色：{user[2]}\n用户权限{user[3]}")
        session.permanent = True  # 启用持久会话
        return jsonify(success=True)
    return jsonify(success=False, message="账号或密码错误")

#退出登录
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('user_account', None)
    session.pop('user_role',None)
    session.pop('user_group',None)
    return jsonify(success=True)


@app.route('/check_login')
def check_login():
    """
    每刷新一次页面，检查一侧session的用户登录状态
    """
    # 增强日志输出，方便调试
    user_id = session.get('user_id')
    user_account = session.get('user_account')
    user_roel=session.get('user_role')
    user_group=session.get('user_group')
    print(f"刷新了页面，获取Session：\n用户ID：{user_id}\n用户账号：{user_account}\n用户角色：{user_roel}\n用户权限：{user_group}")
    """
    后续添加用户头像和昵称等信息
    """

    # 确保返回值一致性
    return jsonify({
        'loggedIn': user_id is not None,
        'account': user_account,
        'user_roel':user_roel,
        'user_group':user_group
    })

# ========================================================

# 管理员接口
@app.route('/admin')
@fun.admin_required
def admin_page():
    return render_template('admin.html')

# 获取配置接口
@app.route('/api/get-config')
@fun.admin_required
def get_config():
    config = query_database.get_video_config()
    if config:
        return jsonify({
            'status': 'success',
            'data': config
        })
    return jsonify({
        'status': 'error',
        'message': '获取配置失败'
    })

# 扫描视频接口
@app.route('/api/scan-videos', methods=['POST'])
@fun.admin_required
def scan_videos():
    try:
        data = request.get_json()
        parent_dir = Path(data['parentDir'])
        
        # 获取VIP设置
        is_vip = data.get('is_vip', False)
        print(f"视频VIP设置: {is_vip}")

        # 重置进度
        update_scan_progress(0, '开始扫描...')

        print(f"开始扫描视频: {parent_dir}")
        
        # 检查是否使用新的扫描逻辑
        try:
            # 从请求中获取缩略图目录（如果提供）
            thumbnail_dir = data.get('thumbnailDir')
            
            # 使用新的扫描逻辑（支持跨根目录和缩略图自动映射）
            result = scan_and_process_videos_new(
                app,
                parent_dir,
                is_vip=is_vip,
                progress_callback=update_scan_progress,
                thumbnail_dir=thumbnail_dir
            )
            print(f"新扫描逻辑完成，结果：{result}")
            
            # 确保进度显示完成
            update_scan_progress(100, '扫描完成')
            
            return jsonify({
                'status': 'success',
                **result
            })
            
        except Exception as e:
            print(f"视频扫描错误: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'视频扫描失败: {str(e)}'
            })
    except Exception as e:
        print(f"扫描视频异常: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        })



@app.route('/api/scan-videos-progress')
def scan_videos_progress():
    def generate():
        last_percentage = -1  # 初始值设为-1确保第一次一定会发送
        timeout_counter = 0  # 添加超时计数器
        max_timeout = 300  # 最大超时时间（60秒）
        
        print(f"🔌 视频扫描SSE连接开始，初始进度: {scan_progress}")
        
        while True:
            current_percentage = scan_progress['percentage']
            current_file = scan_progress['current_file']
            
            # 只有当进度发生实际变化时才发送更新
            if current_percentage != last_percentage:
                data = {
                    'percentage': current_percentage,
                    'current_file': current_file
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_percentage = current_percentage
                timeout_counter = 0  # 重置超时计数器
                
                print(f"📡 视频扫描SSE发送进度: {current_percentage}% - {current_file}")

                # 如果完成则结束事件流
                if current_percentage >= 100:
                    print("🏁 视频扫描SSE进度流结束")
                    break
            else:
                timeout_counter += 1
                # 如果长时间没有进度更新，结束连接避免资源浪费
                if timeout_counter > max_timeout:
                    print("⏰ 视频扫描SSE连接超时，自动关闭")
                    break
                    
            time.sleep(0.2)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/scan-images-progress')
def scan_images_progress():
    def generate():
        last_percentage = -1  # 初始值设为-1确保第一次一定会发送
        timeout_counter = 0  # 添加超时计数器
        max_timeout = 300  # 最大超时时间（60秒）
        
        print(f"🔌 SSE连接开始，初始进度: {image_scan_progress}")
        
        while True:
            # 使用线程锁安全读取进度
            with progress_lock:
                current_percentage = image_scan_progress['percentage']
                current_file = image_scan_progress['current_file']
                current = image_scan_progress['current']
                total = image_scan_progress['total']
            
            # 只有当进度发生实际变化时才发送更新
            if current_percentage != last_percentage:
                data = {
                    'percentage': current_percentage,
                    'current_file': current_file,
                    'current': current,
                    'total': total
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_percentage = current_percentage
                timeout_counter = 0  # 重置超时计数器
                
                print(f"📡 SSE发送进度: {current_percentage}% - {current_file}")

                # 如果完成则结束事件流
                if current_percentage >= 100:
                    print("🏁 SSE进度流结束")
                    break
            else:
                # 增加超时计数器
                timeout_counter += 1
                if timeout_counter >= max_timeout:
                    # 超时退出，发送错误信息
                    error_data = {
                        'percentage': 0,
                        'current_file': '连接超时',
                        'current': 0,
                        'total': 0,
                        'error': True
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
                    print("⏰ SSE连接超时")
                    break
                    
            time.sleep(0.2)
    return Response(generate(), mimetype='text/event-stream')



@app.route('/api/videos')
def get_videos():
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', env_loader.video_everyPageShowVideoNum))
        category = request.args.get('category', '')

        # 获取当前用户权限组
        user_group = session.get('user_group', 1)
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
        
        print(f"用户权限组: {user_group}")

        # 使用新表结构查询视频
        total_count, videos = get_videos_paginated_new(
            page=page,
            per_page=per_page,
            category=category,
            user_group=user_group
        )
        print(f"获取视频总数和分页数据：{total_count, videos}")

        # 计算总页数
        total_pages = (total_count + per_page - 1) // per_page

        return jsonify({
            'status': 'success',
            'data': {
                'videos': videos,
                'pagination': {
                    'current_page': page,
                    'per_page': per_page,
                    'total_pages': total_pages,
                    'total_count': total_count
                }
            }
        })
    except Exception as e:
        print(f"获取视频列表失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取视频列表失败: {str(e)}'
        })

@app.route('/api/video-categories')
def get_video_categories():
    try:
        # 使用新表结构查询分类
        categories = get_video_categories_new()
            
        return jsonify({
            'status': 'success',
            'data': categories
        })
    except Exception as e:
        print(f"获取视频分类失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取视频分类失败: {str(e)}'
        })

@app.route('/api/search-videos')
def search_videos():
    try:
        # 获取搜索关键词和分页参数
        keyword = request.args.get('keyword', '')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', env_loader.video_everyPageShowVideoNum))

        if not keyword:
            return jsonify({
                'status': 'error',
                'message': '请输入搜索关键词'
            })

        # 获取当前用户权限组
        user_group = session.get('user_group', 1)
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1

        # 使用新表结构搜索视频
        total_count, videos = search_videos_by_name_new(
            keyword,
            page=page,
            per_page=per_page,
            user_group=user_group
        )

        # 计算总页数
        total_pages = (total_count + per_page - 1) // per_page

        return jsonify({
            'status': 'success',
            'data': {
                'videos': videos,
                'pagination': {
                    'current_page': page,
                    'per_page': per_page,
                    'total_pages': total_pages,
                    'total_count': total_count
                },
                'keyword': keyword
            }
        })
    except Exception as e:
        print(f"搜索视频失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'搜索视频失败: {str(e)}'
        })

def admin_required_api(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({
                'status': 'error',
                'message': '会话已过期，请重新登录'
            }), 401

        user = query_database.get_user_by_id(session['user_id'])
        if not user or user['user_role'] != 'admin':
            return jsonify({
                'status': 'error',
                'message': '权限不足'
            }), 403

        return f(*args, **kwargs)
    return decorated_function

@app.route('/clear_video_table', methods=['GET'])
def clear_table():
    print("开始清空视频表数据库")
    res=query_database.clear_table()
    return res

@app.route('/api/force-clear-videos', methods=['POST'])
@fun.admin_required
def force_clear_videos():
    """强制清空所有视频表数据"""
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 禁用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                
                # 清空所有视频相关表
                tables_to_clear = []
                
                # 检查哪些表存在
                cursor.execute("SHOW TABLES LIKE 'video%'")
                existing_tables = [row[0] for row in cursor.fetchall()]
                
                for table in existing_tables:
                    if table in ['video_item', 'video_collection', 'video_playlist_item', 'video_playlist']:
                        tables_to_clear.append(table)
                
                # 清空表（按依赖关系顺序）
                clear_order = ['video_playlist_item', 'video_playlist', 'video_item', 'video_collection']
                
                cleared_tables = []
                for table in clear_order:
                    if table in tables_to_clear:
                        try:
                            cursor.execute(f"TRUNCATE TABLE {table}")
                            cleared_tables.append(table)
                            print(f"已清空表: {table}")
                        except Exception as e:
                            print(f"清空表 {table} 失败: {str(e)}")
                
                # 重新启用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                conn.commit()
                
                return jsonify({
                    'status': 'success',
                    'message': f'已强制清空 {len(cleared_tables)} 个视频表',
                    'cleared_tables': cleared_tables
                })
                
    except Exception as e:
        print(f"强制清空视频表失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'强制清空失败: {str(e)}'
        }), 500

@app.route('/api/migrate-videos', methods=['POST'])
@fun.admin_required
def migrate_videos():
    """迁移视频数据到新表结构"""
    try:
        print("开始迁移视频数据到新表结构...")
        result = migrate_from_old_videos()
        
        return jsonify({
            'status': 'success',
            'message': f"迁移完成: 迁移了 {result['migrated_categories']} 个分类, {result['migrated_videos']} 个视频",
            **result
        })
        
    except Exception as e:
        print(f"迁移视频数据失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'迁移失败: {str(e)}'
        }), 500

@app.route('/api/check-migration-status', methods=['GET'])
@fun.admin_required  
def check_migration_status():
    """检查数据迁移状态"""
    try:
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 检查新表记录数
                cursor.execute("SELECT COUNT(*) FROM video_item")
                new_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM video_collection")
                collection_count = cursor.fetchone()[0]
                
                return jsonify({
                    'status': 'success',
                    'data': {
                        'new_table_count': new_count,
                        'collection_count': collection_count,
                        'migration_completed': new_count > 0
                    }
                })
                
    except Exception as e:
        print(f"检查迁移状态失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'检查状态失败: {str(e)}'
        }), 500

@app.route('/clear_image_table', methods=['GET'])
@fun.admin_required
def clear_image_table():
    """清空图片数据表"""
    try:
        print("开始清空图片表数据库")
        db = connect_mysql.Connect_mysql()
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 1. 临时禁用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                
                # 2. 清空 image_item 表 (子表)
                cursor.execute("TRUNCATE TABLE image_item")
                
                # 3. 清空 image_collection 表 (父表)
                cursor.execute("TRUNCATE TABLE image_collection")
                
                # 4. 重新启用外键检查
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                
                # 5. 提交事务
                conn.commit()
                
                print("图片表清空成功")
                return jsonify({"message": "图片数据表已清空"})
                
    except Exception as e:
        print(f"清空图片表异常: {str(e)}")
        traceback.print_exc()
        return jsonify({"message": f"清空图片表失败: {str(e)}"}), 500


@app.route('/api/scan-images', methods=['POST'])
def scan_images():
    print("开始调用图片扫描接口")
    try:
        # 获取前端参数（JSON 格式）
        data = request.get_json()  # 解析 JSON 请求体
        root_path = data.get('parentDir')  # 使用与视频扫描一致的参数名
        is_vip_data = data.get('is_vip', False)  # 默认为False
        
        # 处理不同类型的is_vip值
        if isinstance(is_vip_data, bool):
            is_vip = is_vip_data
        elif isinstance(is_vip_data, str):
            is_vip = is_vip_data.lower() == 'true'
        else:
            is_vip = bool(is_vip_data)
        print("参数：", root_path, is_vip)
        
        # 参数校验
        if not root_path:
            return jsonify({'status': 'error', 'message': '缺少根路径参数'}), 400
        print("参数校验结束")
        
        # 🎯 重置进度
        update_image_scan_progress(0, '开始扫描...', 0, 0)
        print("📊 图片扫描进度已重置")
        
        print("开始扫描图片...")
        
        # 🎯 同步处理图片扫描（传递进度回调函数）
        db = connect_mysql.Connect_mysql()
        result = db.process_image_data_with_progress(root_path, is_vip, update_image_scan_progress)
        print(f"到此处执行正常 开始返回结果 得到的返回值：{result}")
        
        # 确保进度显示完成
        update_image_scan_progress(100, '扫描完成', 0, 0)
        
        # 解析结果并返回
        if result.get('status') == 'success':
            # 从返回消息中提取文件数量
            message = result.get('message', '')
            images_added = 0
            if '共处理' in message and '个文件' in message:
                try:
                    # 提取数字
                    match = re.search(r'共处理(\d+)个文件', message)
                    if match:
                        images_added = int(match.group(1))
                except:
                    pass
            
            return jsonify({
                'status': 'success',
                'message': result.get('message', '图片扫描完成'),
                'images_added': images_added,
                'categories_added': 1 if images_added > 0 else 0,  # 简单估算
                'failed_count': 0
            })
        else:
            return jsonify({
                'status': 'error',
                'message': result.get('message', '图片扫描失败'),
                'images_added': 0,
                'categories_added': 0,
                'failed_count': 1
            })

    except Exception as e:
        print(f"图片扫描异常: {str(e)}")
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 保持原有的 image_upload 路由以保持兼容性
@app.route('/image_upload', methods=['POST'])
def image_upload():
    # 重定向到新的 API
    data = request.get_json()
    new_data = {'parentDir': data.get('root_path'), 'is_vip': data.get('is_vip')}
    
    # 调用新的 scan_images 函数
    request._cached_json = new_data  # 临时修改请求数据
    return scan_images()

@app.route('/api/image_collections')
def get_image_collections():
    try:
        # 获取分页参数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        search = request.args.get('search', '')
        
        # 获取当前用户组
        user_group = session.get('user_group', 1)  # 默认为普通用户组(1)
        print(f"当前用户组: {user_group}, 类型: {type(user_group)}")
        
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
            
        print(f"调用数据库查询用户组: {user_group}")
        
        # 根据搜索条件查询图片集
        if search:
            total_count, collections = query_database.search_image_collections(
                search, 
                page=page, 
                per_page=per_page, 
                user_group=user_group
            )
        else:
            total_count, collections = query_database.get_image_collections_paginated(
                page=page, 
                per_page=per_page, 
                user_group=user_group
            )
        
        # 计算总页数
        total_pages = (total_count + per_page - 1) // per_page
        
        return jsonify({
            'status': 'success',
            'data': {
                'collections': collections,
                'pagination': {
                    'current_page': page,
                    'per_page': per_page,
                    'total_pages': total_pages,
                    'total_items': total_count
                }
            }
        })
    except Exception as e:
        print(f"获取图片集列表失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取图片集列表失败: {str(e)}'
        })

@app.route('/api/image_collection/<int:collection_id>')
def get_image_collection(collection_id):
    try:
        # 获取当前用户组
        user_group = session.get('user_group', 1)  # 默认为普通用户组(1)
        print(f"查看图片集详情 - 当前用户组: {user_group}, 类型: {type(user_group)}")
        
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
            
        print(f"调用数据库查询用户组: {user_group}")
        
        # 先验证图片集是否存在以及用户是否有权限查看
        check_query = """
            SELECT collection_id, group_id
            FROM image_collection
            WHERE collection_id = %s
        """
        
        collection_info = query_database.db.fetch_one_record(check_query, (collection_id,))
        if not collection_info:
            return jsonify({
                'status': 'error',
                'message': '图片集不存在'
            }), 404
            
        group_id = collection_info[1]
        # 普通用户只能访问普通图片集(group_id=1)，VIP用户可以访问所有图片集
        if group_id > 1 and user_group < group_id:
            print(f"用户组({user_group})权限不足，无法访问VIP图片集({collection_id})")
            return jsonify({
                'status': 'error',
                'message': '没有权限访问该图片集'
            }), 403
        
        # 获取图片集信息
        collection = query_database.get_image_collection_by_id(collection_id, user_group)
        
        if not collection:
            print(f"未找到图片集或无权限访问: ID={collection_id}")
            return jsonify({
                'status': 'error',
                'message': '图片集不存在或没有访问权限'
            }), 404
        
        return jsonify({
            'status': 'success',
            'data': collection
        })
    except Exception as e:
        print(f"获取图片集详情失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取图片集详情失败: {str(e)}'
        }), 500

@app.route('/images/<path:filename>')
def serve_images(filename):
    """提供图片文件服务"""
    try:
        cleaned_filename = filename.strip()
        app.logger.info(f"请求图片: {cleaned_filename}")
        
        # 如果为空，返回默认图片
        if not cleaned_filename:
            app.logger.warning("请求的图片文件名为空")
            return send_from_directory(app.static_folder, 'images/default.jpg')
        
        # 从主表中查找图片路径信息
        query_sql = """
            SELECT 
                d.mount_path, 
                c.storage_root, 
                i.relative_path,
                c.group_id
            FROM 
                image_item i
            JOIN 
                image_collection c ON i.collection_id = c.collection_id
            JOIN 
                storage_disk d ON c.disk_id = d.disk_id
            WHERE 
                i.relative_path LIKE %s
            LIMIT 1
        """
        
        # 提取和处理路径组件
        path_obj = Path(cleaned_filename)
        relative_path = str(path_obj).replace('\\', '/')  # 标准化路径
        app.logger.info(f"使用相对路径搜索: {relative_path}")
        
        # 移除路径前面的斜杠，避免路径匹配问题
        if relative_path.startswith('/'):
            relative_path = relative_path[1:]
            app.logger.info(f"移除开头斜杠后的路径: {relative_path}")
        
        # 尝试不同的搜索模式
        search_patterns = [
            f'%{cleaned_filename}%',
            f'%{path_obj.name}%'
        ]
        
        image_info = None
        for pattern in search_patterns:
            app.logger.info(f"使用模式 '{pattern}' 搜索图片")
            image_info = query_database.db.fetch_one_record(query_sql, (pattern,))
            if image_info:
                app.logger.info(f"使用模式 '{pattern}' 找到图片")
                break
        
        if image_info:
            mount_path = image_info[0]
            storage_root = image_info[1]
            relative_path = image_info[2]
            group_id = image_info[3]
            
            app.logger.info(f"找到图片信息: 挂载路径={mount_path}, 存储根路径={storage_root}, 相对路径={relative_path}")
            
            # 检查用户权限
            user_group = session.get('user_group', 1)
            if isinstance(user_group, str):
                user_group = int(user_group) if user_group.isdigit() else 1
            elif user_group is None:
                user_group = 1
                
            # VIP用户可以访问所有图片，普通用户只能访问普通图片集(group_id=1)的图片
            if group_id > 1 and user_group < group_id:
                app.logger.warning(f"用户组({user_group})权限不足，无法访问图片集组({group_id})的图片")
                return send_from_directory(app.static_folder, 'images/default.jpg')
            # 构建完整图片路径
            base_path = Path(mount_path) / storage_root
            # 统一使用正斜杠
            relative_path = relative_path.replace('\\', '/')
            file_name = Path(relative_path).name
            dir_path = str(base_path / Path(relative_path).parent)
            
            app.logger.info(f"提供图片文件: 目录={dir_path}, 文件名={file_name}")
            
            # 检查目录是否存在
            if os.path.exists(dir_path):
                # 检查文件是否存在
                full_path = os.path.join(dir_path, file_name)
                if os.path.isfile(full_path):
                    try:
                        app.logger.info(f"尝试提供文件: {full_path}")
                        # 检查文件是否是图片
                        if file_name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff')):
                            return send_from_directory(dir_path, file_name)
                        else:
                            app.logger.warning(f"请求的文件不是图片: {file_name}")
                            return Response('不支持的文件类型', 415)
                    except Exception as e:
                        app.logger.error(f"提供图片文件出错: {str(e)}")
                        return send_from_directory(app.static_folder, 'images/default.jpg')
                else:
                    app.logger.warning(f"图片文件不存在: {full_path}")
            else:
                app.logger.warning(f"图片目录不存在: {dir_path}")
        else:
            app.logger.warning(f"数据库中未找到图片: {cleaned_filename}")
            
        # 如果找不到图片，返回默认图片
        return send_from_directory(app.static_folder, 'images/default.jpg')
            
    except Exception as e:
        app.logger.error(f"处理图片请求时出错: {str(e)}")
        return send_from_directory(app.static_folder, 'images/default.jpg')

@app.route('/api/get_collection_images/<int:collection_id>', methods=['GET'])
def get_collection_images(collection_id):
    """获取图片集中的所有图片"""
    try:
        # 获取当前用户组，默认为普通用户(1)
        user_group = session.get('user_group', 1)

        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
        print(f"获取到了用户组id：{user_group}")
        # 检查图片集权限
        check_query = """
            SELECT collection_id, group_id
            FROM image_collection
            WHERE collection_id = %s
        """
        
        collection_info = query_database.db.fetch_one_record(check_query, (collection_id,))
        print(f"查询结果：{collection_info}")
        if not collection_info:
            return jsonify({
                "error": "图片集不存在"
            }), 404

        group_id = collection_info[1]
        print(f"最终在用户组id：{group_id}，数据类型：{type(group_id)}")
        # 普通用户只能访问普通图片集(group_id=1)，VIP用户可以访问所有图片集
        if group_id > 1 and user_group < group_id:
            app.logger.warning(f"用户组({user_group})权限不足，无法访问VIP图片集({collection_id})")
            return jsonify({
                "error": "没有权限访问该图片集"
            }), 403
        print("跳过了用户权限验证===============================")
        # 用户有权限，获取图片集中的所有图片
        user_id = session.get('user_id')
        images = query_database.get_images_by_collection_id(collection_id, user_id)
        
        # 检查是否有错误信息
        if isinstance(images, dict) and "error" in images:
            return jsonify(images), 403
            
        return jsonify({"images": images})
    except Exception as e:
        app.logger.error(f"获取图片集图片时发生错误: {str(e)}")
        return jsonify({"error": f"获取图片集图片时发生错误: {str(e)}"}), 500

@app.route('/api/audio_collections')
def get_audio_collections():
    try:
        # 获取分页参数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        search = request.args.get('search', '')
        
        # 获取当前用户组
        user_group = session.get('user_group', 1)  # 默认为普通用户组(1)
        
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
            
        # 根据搜索条件查询音频集
        if search:
            total_count, collections = query_database.search_audio_collections(
                search, 
                page=page, 
                per_page=per_page, 
                user_group=user_group
            )
        else:
            total_count, collections = query_database.get_audio_collections_paginated(
                page=page, 
                per_page=per_page, 
                user_group=user_group
            )
        
        # 计算总页数
        total_pages = (total_count + per_page - 1) // per_page
        
        return jsonify({
            'status': 'success',
            'data': {
                'collections': collections,
                'pagination': {
                    'current_page': page,
                    'per_page': per_page,
                    'total_pages': total_pages,
                    'total_items': total_count
                }
            }
        })
    except Exception as e:
        print(f"获取音频集列表失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取音频集列表失败: {str(e)}'
        })

@app.route('/api/audio_collection/<int:collection_id>')
def get_audio_collection(collection_id):
    try:
        # 获取当前用户组
        user_group = session.get('user_group', 1)
        
        # 如果user_group不是整数，转换为整数
        if isinstance(user_group, str):
            user_group = int(user_group) if user_group.isdigit() else 1
        elif user_group is None:
            user_group = 1
            
        # 验证音频集是否存在以及用户是否有权限查看
        check_query = """
            SELECT collection_id, group_id
            FROM audio_collection
            WHERE collection_id = %s
        """
        
        collection_info = query_database.db.fetch_one_record(check_query, (collection_id,))
        if not collection_info:
            return jsonify({
                'status': 'error',
                'message': '音频集不存在'
            }), 404
            
        group_id = collection_info[1]
        if group_id > 1 and user_group < group_id:
            return jsonify({
                'status': 'error',
                'message': '没有权限访问该音频集'
            }), 403
        
        # 获取音频集信息
        collection = query_database.get_audio_collection_by_id(collection_id, user_group)
        
        if not collection:
            return jsonify({
                'status': 'error',
                'message': '音频集不存在或没有访问权限'
            }), 404
        
        return jsonify({
            'status': 'success',
            'data': collection
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'获取音频集详情失败: {str(e)}'
        }), 500



@app.route('/audios/<path:filename>')
def serve_audio(filename):
    """提供音频文件服务"""
    try:
        print("\n=== 开始处理音频请求 ===")
        print(f"请求的文件名: {filename}")
        
        # 获取当前用户组
        user_group = session.get('user_group', 1)
        print(f"当前用户组: {user_group}")
        
        # 标准化路径
        filename = filename.replace('\\', '/').replace('//', '/')
        print(f"标准化后的文件名: {filename}")
        
        # 检查用户是否有权限访问该音频
        print("检查音频访问权限...")
        access_result = query_database.check_audio_access(filename, user_group)
        print(f"访问权限检查结果: {access_result}")
        if not access_result:
            print("访问权限检查失败，返回403")
            abort(403)
        
        # 🎯 修复：音频路径重复问题
        print("📊 查询音频文件路径信息...")
        
        query_sql = """
            SELECT 
                d.mount_path, 
                a.relative_path
            FROM 
                audio_item a
            JOIN 
                audio_collection c ON a.collection_id = c.collection_id
            JOIN 
                storage_disk d ON c.disk_id = d.disk_id
            WHERE 
                a.relative_path LIKE %s
            LIMIT 1
        """
        
        # 直接使用前端传来的路径构建搜索条件
        search_pattern = f"%{filename}%"
        print(f"搜索模式: {search_pattern}")
        
        # 查询数据库
        print("执行数据库查询...")
        audio_info = query_database.db.fetch_one_record(query_sql, (search_pattern,))
        
        if not audio_info:
            print(f"❌ 未找到音频文件: {filename}")
            abort(404)
        
        # 直接使用数据库存储的完整路径
        mount_path = audio_info[0]
        relative_path = audio_info[1]  # 这已经是完整的相对路径了
        
        print(f"🗂️ 路径信息:")
        print(f"   挂载路径: '{mount_path}'")
        print(f"   相对路径: '{relative_path}'")
        
        # 🔧 直接拼接完整路径（不需要额外的storage_root）
        full_audio_path = os.path.join(mount_path, relative_path)
        print(f"🎵 完整音频路径: {full_audio_path}")
        
        # 检查音频文件是否存在
        if not os.path.isfile(full_audio_path):
            print(f"❌ 音频文件不存在: {full_audio_path}")
            abort(404)
            
        print("✅ 音频文件存在，准备发送...")
        
        # 🔧 使用Path对象分离目录和文件名（与视频模块一致）
        audio_path_obj = Path(full_audio_path)
        audio_directory = str(audio_path_obj.parent)
        audio_filename = audio_path_obj.name
        
        print(f"📁 发送参数:")
        print(f"   目录: {audio_directory}")
        print(f"   文件名: {audio_filename}")
        
        # 返回音频文件，支持范围请求
        return send_from_directory(
            audio_directory,
            audio_filename,
            as_attachment=False,
            conditional=True
        )
    except Exception as e:
        print("\n=== 音频访问出错 ===")
        print(f"错误类型: {type(e)}")
        print(f"错误信息: {str(e)}")
        print("错误堆栈:")
        traceback.print_exc()
        abort(500)

@app.route('/api/scan_audio', methods=['POST'])
@fun.admin_required
def scan_audio():
    """扫描音频文件并保存到数据库"""
    try:
        data = request.get_json()
        root_path = data.get('root_path')
        is_vip = data.get('is_vip', False)
        
        if not root_path:
            return jsonify({
                'status': 'error',
                'message': '缺少根路径参数'
            }), 400
        
        # 🎯 重置音频扫描进度
        update_audio_scan_progress(0, '开始扫描...')
        print("📊 音频扫描进度已重置")
            
        # 🎯 创建音频处理器实例，传递进度回调
        processor = AudioProcessor()
        
        # 🎯 处理音频文件（传递进度回调函数）
        result = processor.process_audio_data(root_path, is_vip, update_audio_scan_progress)
        
        # 确保进度显示完成
        update_audio_scan_progress(100, '扫描完成')
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/clear_audio_table')
@fun.admin_required
def clear_audio_table():
    """清空音频数据表"""
    try:
        # 执行清空操作
        query_database.clear_audio_tables()
        return jsonify({
            'status': 'success',
            'message': '音频数据表已清空'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/process_audio', methods=['POST'])
@fun.admin_required
def process_audio():
    """批量处理音频文件"""
    try:
        data = request.get_json()
        format = data.get('format')
        quality = data.get('quality')
        
        # 这里可以添加音频处理的具体逻辑
        # 例如格式转换、质量调整等
        
        return jsonify({
            'status': 'success',
            'message': '音频处理完成'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/scan-audio-progress')
def scan_audio_progress():
    """🎯 获取音频扫描进度（使用全局进度变量，模仿视频扫描）"""
    def generate():
        last_percentage = -1  # 初始值设为-1确保第一次一定会发送
        timeout_counter = 0  # 添加超时计数器
        max_timeout = 300  # 最大超时时间（60秒）
        
        print(f"🔌 音频扫描SSE连接开始，初始进度: {audio_scan_progress}")
        
        while True:
            # 使用线程锁安全读取进度
            with progress_lock:
                current_percentage = audio_scan_progress['percentage']
                current_file = audio_scan_progress['current_file']
            
            # 只有当进度发生实际变化时才发送更新
            if current_percentage != last_percentage:
                data = {
                    'percentage': current_percentage,
                    'current_file': current_file
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_percentage = current_percentage
                timeout_counter = 0  # 重置超时计数器
                
                print(f"📤 音频扫描SSE发送进度: {current_percentage}% - {current_file}")
                
                # 如果进度达到100%，发送后等待一小段时间再结束
                if current_percentage >= 100:
                    print("🏁 音频扫描进度已达100%，准备关闭SSE连接")
                    time.sleep(0.5)  # 等待0.5秒确保前端接收到最终进度
                    break
            else:
                # 如果进度没有变化，增加超时计数器
                timeout_counter += 1
                if timeout_counter >= max_timeout:
                    print("⏰ 音频扫描SSE连接超时，强制关闭")
                    break
                    
            time.sleep(0.2)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/audio-config', methods=['GET', 'POST'])
@fun.admin_required
def audio_config():
    """获取或更新音频配置"""
    if request.method == 'GET':
        try:
            config = query_database.get_audio_config()
            return jsonify({
                'status': 'success',
                'data': config
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    else:
        try:
            data = request.get_json()
            audio_base = data.get('audio_base')
            
            if not audio_base:
                return jsonify({
                    'status': 'error',
                    'message': '音频根路径不能为空'
                }), 400
            
            # 保存配置
            result = query_database.save_audio_config(audio_base)
            return jsonify(result)
            
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500


if __name__ == '__main__':
    from codes import env_loader
    app.run(debug=True, host=env_loader.app_host, port=env_loader.app_port)

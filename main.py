import os
import subprocess
from flask import Flask, render_template, send_from_directory, url_for,request, jsonify, session, Response
from codes import query_database
from codes import config
from codes import function as fun
from functools import wraps
import json
import time

app = Flask(__name__)
app.secret_key = fun.get_app_secret_key()
# 配置常量 ============================================>
resource_config=query_database.get_video_config()
print(f"res:{resource_config['video_base']}  {resource_config['thumbnail_base']}")
app.config.update({
    'VIDEO_BASE': resource_config["video_base"],  # 外部视频路径
    'THUMBNAIL_BASE': resource_config["thumbnail_base"],  # 外部缩略图路径
    'DEFAULT_THUMB_PATH': 'images/default.jpg'
})

# 全局变量用于存储进度信息
scan_progress = {
    'percentage': 0,
    'current_file': '',
    'type': None
}

thumbnail_progress = {
    'percentage': 0,
    'current_file': '',
    'total': 0,
    'current': 0
}

def update_scan_progress(percentage, current_file):
    global scan_progress
    # 确保百分比在有效范围内且只能增加
    percentage = max(0, min(100, percentage))
    if percentage >= scan_progress['percentage'] or percentage == 0:
        scan_progress['percentage'] = percentage
        scan_progress['current_file'] = current_file

def update_thumbnail_progress(percentage, current_file, current, total):
    global thumbnail_progress
    # 确保百分比在有效范围内且只能增加
    percentage = max(0, min(100, percentage))
    if percentage >= thumbnail_progress['percentage'] or percentage == 0:
        thumbnail_progress['percentage'] = percentage
        thumbnail_progress['current_file'] = current_file
        thumbnail_progress['current'] = current
        thumbnail_progress['total'] = total

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video')
def video_page():
    with app.app_context():
        default_thumb = url_for('static', filename=app.config['DEFAULT_THUMB_PATH'])
    return render_template('video.html', default_thumb=default_thumb)

@app.route('/videos/<path:path>')
def serve_video(path):
    return send_from_directory(app.config['VIDEO_BASE'], path)


@app.route('/thumbnails/<path:path>')
def serve_thumbnail(path):
    thumbnail_path = os.path.join(app.config['THUMBNAIL_BASE'], path)
    print(f"视频缩略图保存路径：{thumbnail_path}")
    video_rel_path = os.path.splitext(path)[0] + '.mp4'
    video_path = os.path.join(app.config['VIDEO_BASE'], video_rel_path)

    if not os.path.exists(thumbnail_path):
        try:
            os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
            try:
                subprocess.run([
                    config.ffmpeg_path,
                    "-ss", "00:01:00",  # 放在输入前加速定位
                    "-i", video_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    "-map", "0:v:0",  # 明确选择第一个视频流
                    "-vsync", "vfr",  # 防止时间戳警告
                    "-y",
                    thumbnail_path
                ], check=True, stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            except Exception as e:
                subprocess.run([
                    config.ffmpeg_path,
                    "-ss", "00:00:09",  # 放在输入前加速定位
                    "-i", video_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    "-map", "0:v:0",  # 明确选择第一个视频流
                    "-vsync", "vfr",  # 防止时间戳警告
                    "-y",
                    thumbnail_path
                ], check=True, stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except Exception as e:
            app.logger.error(f"缩略图生成失败: {str(e)}")
            return send_from_directory(app.static_folder, app.config['DEFAULT_THUMB_PATH'])

    try:
        return send_from_directory(app.config['THUMBNAIL_BASE'], path)
    except:
        return send_from_directory(app.static_folder, app.config['DEFAULT_THUMB_PATH'])

@app.route('/image')
def image_page():
    return render_template('image.html')

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
        session['user_account'] = account
        return jsonify(success=True)
    return jsonify(success=False, message="账号或密码错误")

#退出登录
@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('user_account', None)
    return jsonify(success=True)


@app.route('/check_login')
def check_login():
    return jsonify(
        loggedIn='user_id' in session,
        account=session.get('user_account', '')
    )

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

# 保存配置接口
@app.route('/api/save-config', methods=['POST'])
@fun.admin_required
def save_config():
    data = request.get_json()
    result = query_database.save_video_config(data['videoBase'], data['thumbnailBase'])
    return jsonify(result)

# 扫描视频接口
@app.route('/api/scan-videos', methods=['POST'])
@fun.admin_required
def scan_videos():
    try:
        data = request.get_json()

        #获取视频和缩略图一级路径
        config_data = query_database.get_video_config()
        print(f"获取到返回的数据：{config_data}")
        if not config_data:
            return jsonify({
                'status': 'error',
                'message': '请先配置视频和缩略图根路径'
            })

        # 重置进度
        update_scan_progress(0, '开始扫描...')

        print("开始扫描视频...")
        result = fun.scan_and_process_videos(
            app,
            data['parentDir'],
            config_data['video_base'],
            progress_callback=update_scan_progress  # 添加进度回调
        )
        print(f"到此处执行正常 开始返回结果 得到的返回值：{result}")

        # 确保进度显示完成
        update_scan_progress(100, '扫描完成')

        return jsonify({
            'status': 'success',
            **result
        })
    except Exception as e:
        print(e)
        return jsonify({
            'status': 'error',
            'message': str(e)
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

# 生成所有视频缩略图接口
@app.route('/api/generate-all-thumbnails', methods=['POST'])
@fun.admin_required
def generate_all_thumbnails():
    try:
        # 获取配置信息
        config = query_database.get_video_config()
        print(f"生成缩略图首次获取配置信息：{config}")
        if not config:
            return jsonify({
                'status': 'error',
                'message': '请先配置视频和缩略图根路径'
            })

        video_base = config['video_base']
        thumbnail_base = config['thumbnail_base']
        print(f"视频根路径：{video_base}  缩略图根路径：{thumbnail_base}")

        # 确保路径存在
        if not os.path.exists(video_base):
            return jsonify({
                'status': 'error',
                'message': '视频根路径不存在'
            })
        if not os.path.exists(thumbnail_base):
            os.mkdir(thumbnail_base)
            # return jsonify({
            #     'status': 'error',
            #     'message': '缩略图根路径不存在'
            # })

        # 获取所有视频信息
        videos = query_database.get_all_videos()
        print(f"获取所有视频信息；{videos}")
        if not videos:
            return jsonify({
                'status': 'error',
                'message': '数据库中没有视频记录'
            })

        total_videos = len(videos)
        # 重置进度
        update_thumbnail_progress(0, '开始生成缩略图...', 0, total_videos)

        success_count = 0
        failed_count = 0
        failed_videos = []

        # 循环生成缩略图
        for index, video in enumerate(videos, 1):
            try:
                video_rel_path = video['video_path']  # 相对路径
                video_name = video['video_name']

                # 更新进度
                percentage = int((index / total_videos) * 100)
                update_thumbnail_progress(
                    percentage,
                    video_name,
                    index,
                    total_videos
                )

                # 构建完整路径
                video_abs_path = os.path.join(video_base, video_rel_path, video_name)
                print(f"构建视频完整路径：{video_abs_path}")
                # 构建缩略图路径（使用视频名但改为jpg后缀）
                thumb_name = os.path.splitext(video_name)[0] + '.jpg'
                thumbnail_abs_path = os.path.join(thumbnail_base, video_rel_path, thumb_name)
                print(f"构建缩略图完整路径：{thumbnail_abs_path}")

                # 确保缩略图目录存在
                os.makedirs(os.path.dirname(thumbnail_abs_path), exist_ok=True)

                # 检查视频文件是否存在
                if not os.path.exists(video_abs_path):
                    raise FileNotFoundError(f'视频文件不存在: {video_abs_path}')

                # 生成缩略图
                print("开始调用方法生成缩略图...")
                if fun.generate_thumbnail(video_abs_path, thumbnail_abs_path):
                    success_count += 1
                else:
                    failed_count += 1
                    failed_videos.append(f"{video_name} (路径: {video_rel_path})")

            except Exception as e:
                failed_count += 1
                failed_videos.append(f"{video_name} (错误: {str(e)})")
                print(f"处理视频 {video_name} 时出错: {str(e)}")

        # 更新最终进度
        update_thumbnail_progress(100, '生成完成', total_videos, total_videos)

        return jsonify({
            'status': 'success',
            'data': {
                'total': total_videos,
                'success_count': success_count,
                'failed_count': failed_count,
                'failed_videos': failed_videos
            }
        })

    except Exception as e:
        print(f"生成缩略图过程中发生错误: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'生成缩略图过程中发生错误: {str(e)}'
        })

@app.route('/api/scan-videos-progress')
def scan_videos_progress():
    def generate():
        last_percentage = -1  # 初始值设为-1确保第一次一定会发送
        while True:
            current_percentage = scan_progress['percentage']
            # 只有当进度发生实际变化时才发送更新
            if current_percentage != last_percentage:
                data = {
                    'percentage': current_percentage,
                    'current_file': scan_progress['current_file']
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_percentage = current_percentage

                # 如果完成则结束事件流
                if current_percentage >= 100:
                    break
            time.sleep(0.2)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/generate-thumbnails-progress')
def generate_thumbnails_progress():
    def generate():
        last_percentage = -1  # 初始值设为-1确保第一次一定会发送
        while True:
            current_percentage = thumbnail_progress['percentage']
            # 只有当进度发生实际变化时才发送更新
            if current_percentage != last_percentage:
                data = {
                    'percentage': current_percentage,
                    'current_file': thumbnail_progress['current_file'],
                    'current': thumbnail_progress['current'],
                    'total': thumbnail_progress['total']
                }
                yield f"data: {json.dumps(data)}\n\n"
                last_percentage = current_percentage

                # 如果完成则结束事件流
                if current_percentage >= 100:
                    break
            time.sleep(0.2)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/videos')
def get_videos():
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        category = request.args.get('category', '')
        
        # 获取视频总数和分页数据
        total_count, videos = query_database.get_videos_paginated(
            page=page,
            per_page=per_page,
            category=category
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
        categories = query_database.get_video_categories()
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
        keyword = request.args.get('keyword', '')
        if not keyword:
            return jsonify({
                'status': 'error',
                'message': '请输入搜索关键词'
            })
            
        videos = query_database.search_videos_by_name(keyword)
        
        return jsonify({
            'status': 'success',
            'data': videos
        })
    except Exception as e:
        print(f"搜索视频失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'搜索视频失败: {str(e)}'
        })

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0")

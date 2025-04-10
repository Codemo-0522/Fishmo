import os
import subprocess
from flask import Flask, render_template, send_from_directory, url_for,request, jsonify, session
from codes import query_database
from codes import config
from codes import function as fun

app = Flask(__name__)
app.secret_key = fun.get_app_secret_key()
# 配置常量 ============================================>
app.config.update({
    'VIDEO_BASE': config.VIDEO_BASE,  # 外部视频路径
    'THUMBNAIL_BASE': config.THUMBNAIL_BASE,  # 外部缩略图路径
    'DEFAULT_THUMB_PATH': 'images/default.jpg'
})


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video')
def video_page():
    """视频展示页面路由"""
    with app.app_context():
        default_thumb = url_for('static', filename=app.config['DEFAULT_THUMB_PATH'])

    return render_template(
        'video.html',
        video_data=fun.get_video_structure(app),
        default_thumb=default_thumb
    )


@app.route('/videos/<path:path>')
def serve_video(path):
    return send_from_directory(app.config['VIDEO_BASE'], path)


@app.route('/thumbnails/<path:path>')
def serve_thumbnail(path):
    thumbnail_path = os.path.join(app.config['THUMBNAIL_BASE'], path)
    video_rel_path = os.path.splitext(path)[0] + '.mp4'
    video_path = os.path.join(app.config['VIDEO_BASE'], video_rel_path)

    if not os.path.exists(thumbnail_path):
        try:
            os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
            subprocess.run([
                config.ffmpeg_path,
                "-ss", "00:00:00",  # 放在输入前加速定位
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
    data = request.get_json()
    #获取视频和缩略图一级路径
    config = query_database.get_video_config()
    print(f"获取到返回的数据：{config}")
    if not config:
        return jsonify({
            'status': 'error',
            'message': '请先配置视频和缩略图根路径'
        })

    try:
        print("开始扫描视频...")
        result = fun.scan_and_process_videos(
            app,
            data['parentDir'],
            config['video_base'],
        )
        print(f"到此处执行正常 开始返回结果 得到的返回值：{result}")
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

if __name__ == '__main__':
    os.makedirs(app.config['VIDEO_BASE'], exist_ok=True)
    os.makedirs(app.config['THUMBNAIL_BASE'], exist_ok=True)
    app.run(debug=True, host="0.0.0.0")

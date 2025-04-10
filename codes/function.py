# codes/function.py
import os
import subprocess
from codes import config, query_database
import tkinter as tk
from tkinter import filedialog

def generate_thumbnail(video_fullpath, thumbnail_fullpath):
    """生成视频缩略图（带自动创建目录功能）
    video_fullpath ： 视频完整路径
    thumbnail_fullpath : 缩略图完整路径
    缩略图包含文件名，所有需要在外部处理（获取缩略图文件名）
    """
    try:
        #创建缩略图所在目录，去除文件名后的目录
        os.makedirs(os.path.dirname(thumbnail_fullpath), exist_ok=True)
        subprocess.run([
            config.ffmpeg_path,
            "-ss", "00:00:00",  # 放在输入前加速定位
            "-i", video_fullpath,
            "-vframes", "1",
            "-q:v", "2",
            "-map", "0:v:0",  # 明确选择第一个视频流
            "-vsync", "vfr",  # 防止时间戳警告
            "-y",
            thumbnail_fullpath
        ], check=True, stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except Exception as e:
        print(f"生成缩略图异常：{str(e)}")
        raise

def get_video_structure(app):
    """生成视频目录结构（不再生成缩略图）"""
    video_structure = {}
    for root, dirs, files in os.walk(app.config['VIDEO_BASE']):
        relative_path = os.path.relpath(root, app.config['VIDEO_BASE'])
        if relative_path == '.':
            continue

        category = relative_path.split(os.sep)[0]
        current_videos = []

        for file in files:
            if not file.lower().endswith('.mp4'):
                continue

            video_rel = os.path.join(relative_path, file).replace('\\', '/')
            base_name = os.path.splitext(file)[0]
            thumb_rel = os.path.join(relative_path, f"{base_name}.jpg").replace('\\', '/')

            current_videos.append({
                'path': video_rel,
                'name': base_name,
                'thumb_rel': thumb_rel
            })

        if current_videos:
            video_structure.setdefault(category, {})[relative_path] = current_videos
    return video_structure


# 生成flask的app secret key
from functools import wraps
from flask import abort, session

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            abort(401)
        
        # 查询数据库获取用户角色
        user = query_database.get_user_by_id(user_id)
        if not user or (isinstance(user, dict) and user.get('user_role') != 'admin'):
            abort(403)
            
        session['user_role'] = user['user_role']
        return f(*args, **kwargs)
    return decorated_function


# 选择视频根路径和缩略图根路径并写入数据库
def select_and_save_paths(app):
    root = tk.Tk()
    root.withdraw()
    video_base = filedialog.askdirectory(title='选择视频根路径')
    thumbnail_base = filedialog.askdirectory(title='选择缩略图根路径')
    if video_base and thumbnail_base:
        app.config['VIDEO_BASE'] = video_base
        app.config['THUMBNAIL_BASE'] = thumbnail_base
        query_database.save_video_config(video_base, thumbnail_base)


#扫描视频写入数据库
import os

def scan_and_process_videos(app, parent_dir, video_base):
    """确保每个子文件夹内的所有视频文件都被插入数据库"""
    result = {
        'categories_added': 0,
        'videos_added': 0,
        'failed_count': 0
    }
    print(f"扫描的视频父目录：{parent_dir}")

    # 支持的视频扩展名（按需补充）
    VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.flv'}

    # 记录有效分类（避免空目录）
    valid_categories = set()

    # 遍历所有子目录（包含深层嵌套）
    for root, dirs, files in os.walk(parent_dir):
        # 计算相对路径（关键点：排除父目录自身）
        relative_path = os.path.relpath(root, parent_dir)
        if relative_path == '.':
            continue  # 跳过父目录层

        # 关键修改点：分类名 = 当前文件夹名称（非完整路径）
        category = os.path.basename(root)  # 如 parent_dir/v1/v2 的 category 是 v2

        # 处理当前目录下的每个文件
        for filename in files:
            # 严格过滤视频文件
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext not in VIDEO_EXTENSIONS:
                continue  # 跳过非视频文件

            # 构建插入参数
            video_name = filename  # 包含扩展名
            video_path = relative_path.replace(os.path.sep, '/')  # 保持完整相对路径

            try:
                # 调试输出（确认每个文件都被处理）
                print(f"正在插入：分类[{category}] 文件名[{video_name}] 路径[{video_path}]")

                # 执行数据库插入（示例方法）
                query_database.insert_video_info(
                    category=category,
                    video_path=video_path,
                    video_name=video_name
                )

                # 更新统计结果
                valid_categories.add(category)
                result['videos_added'] += 1

            except Exception as e:
                print(f"插入失败：{os.path.join(root, filename)} | 错误：{str(e)}")
                result['failed_count'] += 1

    # 最终统计有效分类数
    result['categories_added'] = len(valid_categories)
    print(f"数据插入成功，返回结果：{result}")
    return result


def get_app_secret_key():
    return os.urandom(24).hex()


# codes/function.py
import os
import subprocess
from codes import config, query_database
import tkinter as tk
from tkinter import filedialog

def generate_thumbnail(video_path, thumbnail_path):
    print(f"开始生成缩略图 视频路径：{video_path}   缩略图路径：{thumbnail_path}")
    """
    生成视频缩略图
    :param video_path: 视频完整路径
    :param thumbnail_path: 缩略图保存路径
    :return: bool 是否成功
    """
    try:
        try:
            subprocess.run([
                config.ffmpeg_path,
                "-ss", "00:01:00",  # 从视频开始处截取
                "-i", video_path,
                "-vframes", "1",  # 只截取一帧
                "-q:v", "2",  # 设置图片质量
                "-map", "0:v:0",  # 选择第一个视频流
                "-vsync", "vfr",  # 防止时间戳警告
                "-y",  # 覆盖已存在的文件
                thumbnail_path
            ], check=True, stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            return True
        except Exception as e:
            subprocess.run([
                config.ffmpeg_path,
                "-ss", "00:00:09",  # 从视频开始处截取
                "-i", video_path,
                "-vframes", "1",  # 只截取一帧
                "-q:v", "2",  # 设置图片质量
                "-map", "0:v:0",  # 选择第一个视频流
                "-vsync", "vfr",  # 防止时间戳警告
                "-y",  # 覆盖已存在的文件
                thumbnail_path
            ], check=True, stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            return True
    except Exception as e:
        print(f"生成缩略图失败: {str(e)}")
        return False

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

def scan_and_process_videos(app, parent_dir, video_base, progress_callback=None):
    """
    扫描并处理视频文件
    
    Args:
        app: Flask应用实例
        parent_dir: 要扫描的目录
        video_base: 视频根目录
        progress_callback: 进度更新回调函数
    """
    result = {
        'categories_added': 0,
        'videos_added': 0,
        'failed_count': 0
    }
    
    try:
        if not os.path.exists(parent_dir):
            raise Exception('目录不存在')

        # 支持的视频扩展名
        VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.flv'}
        
        # 记录有效分类（避免空目录）
        valid_categories = set()
        
        # 首先收集所有视频文件以计算总数
        video_files = []
        for root, _, files in os.walk(parent_dir):
            for filename in files:
                file_ext = os.path.splitext(filename)[1].lower()
                if file_ext in VIDEO_EXTENSIONS:
                    video_files.append((root, filename))

        if not video_files:
            raise Exception('未找到视频文件')

        total_files = len(video_files)
        
        # 处理每个视频文件
        for index, (root, filename) in enumerate(video_files, 1):
            try:
                # 更新进度
                if progress_callback:
                    percentage = int((index / total_files) * 100)
                    progress_callback(percentage, filename)

                # 计算相对路径
                relative_path = os.path.relpath(root, parent_dir)
                if relative_path == '.':
                    continue  # 跳过父目录层

                # 分类名 = 当前文件夹名称
                category = os.path.basename(root)
                
                # 构建插入参数
                video_name = filename
                video_path = relative_path.replace(os.path.sep, '/')

                # 调试输出
                print(f"正在插入：分类[{category}] 文件名[{video_name}] 路径[{video_path}]")

                # 执行数据库插入
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
                continue

        # 最终统计有效分类数
        result['categories_added'] = len(valid_categories)
        print(f"数据插入成功，返回结果：{result}")
        return result

    except Exception as e:
        print(f"扫描视频时发生错误: {str(e)}")
        raise


def get_app_secret_key():
    return os.urandom(24).hex()


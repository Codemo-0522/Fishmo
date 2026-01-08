import os
import subprocess
from codes import query_database
from codes import env_loader
from pathlib import Path

from pymediainfo import MediaInfo
from functools import wraps
from flask import abort, session, render_template
from codes.video_queries_new import insert_video_collection, insert_video_item, get_or_create_disk


def get_optimal_screenshot_time(video_path):
    """
    智能计算视频的最佳截图时间点
    
    Args:
        video_path: 视频文件路径
        
    Returns:
        str: 格式化的时间点字符串 (HH:MM:SS) 或 None
    """
    try:
        print(f"🔍 分析视频时长: {video_path}")
        
        # 使用MediaInfo获取视频时长
        media_info = MediaInfo.parse(video_path)
        
        for track in media_info.tracks:
            if track.track_type == "Video" and track.duration:
                # 获取时长（毫秒）
                duration_ms = track.duration
                duration_seconds = duration_ms / 1000
                
                print(f"📊 视频时长: {duration_seconds:.2f}秒")
                
                # 计算最佳截图时间点的策略
                if duration_seconds < 10:
                    # 极短视频：使用前3秒或一半时间
                    optimal_seconds = min(3, duration_seconds / 2)
                elif duration_seconds < 60:
                    # 短视频（<1分钟）：使用一半时间
                    optimal_seconds = duration_seconds / 2
                elif duration_seconds < 300:
                    # 中等视频（1-5分钟）：使用一半时间，但不超过2分钟
                    optimal_seconds = min(duration_seconds / 2, 120)
                else:
                    # 长视频（>5分钟）：使用1/3时间，在30秒到3分钟之间
                    optimal_seconds = max(30, min(duration_seconds / 3, 180))
                
                # 转换为 HH:MM:SS 格式
                hours = int(optimal_seconds // 3600)
                minutes = int((optimal_seconds % 3600) // 60)
                seconds = int(optimal_seconds % 60)
                
                time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                print(f"🎯 计算出最佳截图时间点: {time_str} (第{optimal_seconds:.1f}秒)")
                
                return time_str
        
        print("⚠️ 无法获取视频时长，将使用备选方案")
        return None
        
    except Exception as e:
        print(f"❌ 分析视频时长失败: {str(e)}")
        return None


def generate_thumbnail(video_path, thumbnail_path):
    """
    从视频生成缩略图（优化版：智能选择时间点）
    
    Args:
        video_path: 视频文件的完整路径
        thumbnail_path: 保存缩略图的完整路径
        
    Returns:
        bool: 是否成功生成缩略图
    """
    try:
        # 将路径字符串转换为Path对象
        video_path_obj = Path(video_path)
        thumbnail_path_obj = Path(thumbnail_path)
        
        print(f"开始生成缩略图 视频路径：{video_path_obj}   缩略图路径：{thumbnail_path_obj}")
        
        # 确保视频文件存在
        if not video_path_obj.exists():
            print(f"视频文件不存在: {video_path_obj}")
            return False
            
        # 确保缩略图目录存在
        thumbnail_dir = thumbnail_path_obj.parent
        thumbnail_dir.mkdir(parents=True, exist_ok=True)
        
        # 转换Path对象为字符串，确保ffmpeg可以正确处理
        video_path_str = str(video_path_obj)
        thumbnail_path_str = str(thumbnail_path_obj)
        
        print(f"处理后的路径 - 视频: {video_path_str}, 缩略图: {thumbnail_path_str}")
        
        # 🎯 智能获取视频时长并计算最佳截图时间点
        optimal_time_point = get_optimal_screenshot_time(video_path_str)
        
        # 构建时间点列表：最佳时间点优先，然后是备选方案
        time_points = []
        if optimal_time_point:
            time_points.append(optimal_time_point)
            print(f"✅ 使用智能计算的最佳时间点: {optimal_time_point}")
        
        # 添加备选时间点（按重要性排序）
        fallback_points = ["00:00:30", "00:01:00", "00:00:10", "00:00:05", "00:00:00"]
        for point in fallback_points:
            if point not in time_points:
                time_points.append(point)
        
        print(f"时间点策略: {time_points}")
        
        for time_point in time_points:
            try:
                print(f"尝试从 {time_point} 处截取缩略图...")
                # 优化的FFmpeg命令：更快的截图生成
                ffmpeg_cmd = [
                    env_loader.ffmpeg_path,
                    "-ss", time_point,  # 快速定位到指定时间点（输入参数）
                    "-i", video_path_str,  # 输入文件
                    "-vframes", "1",  # 只截取一帧
                    "-q:v", "2",  # 高质量截图
                    "-map", "0:v:0",  # 选择第一个视频流
                    "-vsync", "vfr",  # 可变帧率同步
                    "-threads", "1",  # 单线程模式（避免资源争抢）
                    "-an",  # 禁用音频处理（加速）
                    "-sn",  # 禁用字幕处理（加速）
                    "-dn",  # 禁用数据流处理（加速）
                    "-avoid_negative_ts", "make_zero",  # 避免负时间戳
                    "-y",  # 覆盖输出文件
                    "-pix_fmt", "yuvj420p",  # 兼容的像素格式
                    thumbnail_path_str  # 输出文件路径（必须在最后）
                ]
                
                print(f"执行命令: {' '.join(str(x) for x in ffmpeg_cmd)}")
                
                # 执行ffmpeg命令
                # 解决编码问题，设置encoding='utf-8', errors='ignore'，避免GBK解码错误
                result = subprocess.run(
                    ffmpeg_cmd,
                    check=False,  # 不抛出错误，手动检查返回码
                    stderr=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                    encoding='utf-8',  # 使用UTF-8编码
                    errors='ignore'    # 忽略无法解码的字符
                )
                
                # 检查命令是否成功执行
                if result.returncode != 0:
                    print(f"FFmpeg命令返回错误码: {result.returncode}")
                    print(f"错误输出: {result.stderr}")
                    continue
                
                # 检查输出文件是否存在
                if thumbnail_path_obj.exists():
                    print(f"成功从 {time_point} 处生成缩略图")
                    return True
                else:
                    print(f"命令成功但未生成文件，尝试下一个时间点")
                    continue
                    
            except subprocess.CalledProcessError as e:
                print(f"从 {time_point} 处截取失败: {str(e)}")
                if hasattr(e, 'stderr') and e.stderr:
                    try:
                        print(f"命令错误输出: {e.stderr}")
                    except UnicodeDecodeError:
                        print("命令产生了无法解码的错误输出")
                continue
                
            except UnicodeDecodeError as e:
                print(f"处理FFmpeg输出时出现编码错误: {str(e)}")
                # 检查文件是否存在，即使出现编码错误
                if thumbnail_path_obj.exists():
                    print("尽管有编码错误，但缩略图已成功生成")
                    return True
                continue
                
            except Exception as e:
                print(f"未知错误: {str(e)}")
                continue
                
        print("所有时间点尝试均失败，无法生成缩略图")
        return False
        
    except Exception as e:
        print(f"生成缩略图过程中发生异常: {str(e)}")
        return False

def get_video_structure(app):
    """生成视频目录结构（不再生成缩略图）"""
    video_structure = {}
    video_base = Path(app.config['VIDEO_BASE'])
    
    for root, dirs, files in os.walk(video_base):
        root_path = Path(root)
        relative_path = root_path.relative_to(video_base)
        if str(relative_path) == '.':
            continue

        # 使用Path.parts获取路径的组成部分
        category = relative_path.parts[0] if relative_path.parts else ''
        current_videos = []

        for file in files:
            if not file.lower().endswith('.mp4'):
                continue

            # 使用Path对象处理路径
            file_path = Path(file)
            video_rel = relative_path / file_path
            # 转换为字符串并使用正斜杠表示路径（Web兼容）
            video_rel_str = str(video_rel).replace('\\', '/')
            
            # 获取文件名（不含扩展名）
            base_name = file_path.stem
            # 构建缩略图相对路径
            thumb_rel = relative_path / f"{base_name}.jpg"
            thumb_rel_str = str(thumb_rel).replace('\\', '/')

            current_videos.append({
                'path': video_rel_str,
                'name': base_name,
                'thumb_rel': thumb_rel_str
            })

        if current_videos:
            # 确保分类存在于字典中
            if category not in video_structure:
                video_structure[category] = {}
            # 使用相对路径的字符串作为键
            rel_path_str = str(relative_path).replace('\\', '/')
            video_structure[category][rel_path_str] = current_videos
    
    return video_structure

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            # 返回自定义错误页面而不是abort(401)
            return render_template('error.html', 
                error_code=401,
                error_title='请先登录',
                error_message='访问此页面需要先登录您的账户',
                error_suggestions=[
                    '点击下方"重新登录"按钮进行登录',
                    '如果没有账户，请先注册一个新账户',
                    '确保您使用的是正确的登录凭据'
                ],
                is_admin=False
            ), 401
        
        # 查询数据库获取用户角色
        user = query_database.get_user_by_id(user_id)
        if not user or (isinstance(user, dict) and user.get('user_role') != 'admin'):
            # 返回自定义错误页面而不是abort(403)
            return render_template('error.html',
                error_code=403,
                error_title='访问权限不足',
                error_message='抱歉，您没有访问天枢监（管理后台）的权限',
                error_suggestions=[
                    '此页面仅限管理员账户访问',
                    '请联系系统管理员获取相应权限',
                    '您可以返回其他页面继续浏览'
                ],
                is_admin=False
            ), 403
            
        session['user_role'] = user['user_role']
        return f(*args, **kwargs)
    return decorated_function


#视频画质匹配
STANDARD_RESOLUTIONS = [
    # 名称             宽      高      宽高比（近似）  优先级
    ("8K",        7680,   4320,   (16,9),        100),
    ("4K",        4096,   2160,   (17,9),        95),
    ("4K",        3840,   2160,   (16,9),        90),
    ("2K",        2048,   1080,   (17,9),        85),
    ("2K",    2560,   1440,   (16,9),        80),
    ("1080p",   1920,   1080,   (16,9),        75),
    ("720p",     1280,   720,    (16,9),        70),
    ("480p",          854,    480,    (16,9),        65),
    ("360p",          640,    360,    (16,9),        60),
    ("240p",          426,    240,    (16,9),        55),
    ("5K",  5120,   2160,   (21,9),        90),
    ("3440x1440",     3440,   1440,   (21,9),        80),
    ("2560x1080",     2560,   1080,   (21,9),        75),
]

def get_quality_label(width, height):
    """获取视频画质标签"""
    if height > width:  # 竖屏视频
        width, height = height, width  # 交换宽高
    best_match = None
    best_score = 0

    for name, std_w, std_h, aspect_ratio, priority in STANDARD_RESOLUTIONS:
        input_aspect = width / height
        std_aspect = aspect_ratio[0] / aspect_ratio[1]
        aspect_diff = abs(input_aspect - std_aspect)

        w_diff = abs(width - std_w) / std_w
        h_diff = abs(height - std_h) / std_h
        res_score = 1 - (w_diff + h_diff)/2

        total_score = (res_score * 0.4 + (1 - aspect_diff) * 0.6) * priority

        if total_score > best_score:
            best_score = total_score
            best_match = name
    return best_match if best_score > 0.7 else f"Custom ({width}x{height})"

def format_duration(milliseconds):
    """获取视频时长"""
    total_seconds = int(milliseconds // 1000)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}时{minutes}分{seconds}秒"
    elif minutes > 0:
        return f"{minutes}分{seconds}秒"
    else:
        return f"{seconds}秒"

#扫描视频写入数据库
def scan_and_process_videos(app, parent_dir, video_base, is_vip=False, progress_callback=None):
    """
    扫描并处理视频文件
    
    Args:
        app: Flask应用实例
        parent_dir: 要扫描的目录(Path对象)
        video_base: 视频根目录(Path对象)
        is_vip: 是否为VIP视频（默认False）
        progress_callback: 进度更新回调函数
    """
    global video_duration, video_quality
    result = {
        'categories_added': 0,
        'videos_added': 0,
        'failed_count': 0
    }
    
    try:
        # 确保目录存在且为Path对象
        if isinstance(parent_dir, str):
            parent_dir = Path(parent_dir)
        if isinstance(video_base, str):
            video_base = Path(video_base)
            
        if not parent_dir.exists():
            raise Exception('目录不存在')

        # 支持的视频扩展名
        VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.flv'}
        
        # 记录有效分类（避免空目录）
        valid_categories = set()
        
        # 首先收集所有视频文件以计算总数
        video_files = []
        for root, _, files in os.walk(parent_dir):
            root_path = Path(root)
            for filename in files:
                file_path = Path(filename)
                file_ext = file_path.suffix.lower()
                if file_ext in VIDEO_EXTENSIONS:
                    video_files.append((root_path, filename))

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
                relative_path = root.relative_to(parent_dir)
                if str(relative_path) == '.':
                    continue  # 跳过父目录层

                # 分类名 = 当前文件夹名称
                category = root.name
                
                # 构建插入参数
                video_name = filename
                # 转换为Web兼容的路径格式（使用正斜杠）
                video_path = str(relative_path).replace('\\', '/')
                #获取视频时长、画质=====================================================
                # 获取当前视频的完整路径
                full_video_path = root / filename
                print(f"获取视频画质和时长的视频路径：{full_video_path}")
                media_info = MediaInfo.parse(full_video_path)
                for track in media_info.tracks:
                    if track.track_type == "Video":
                        video_duration = track.duration
                        video_duration = format_duration(video_duration)
                        print(f"时长：{video_duration}")
                        print(f"分辨率：{track.width}x{track.height}")
                        width = track.width
                        height = track.height
                        video_quality = get_quality_label(width, height)
                        print(f"画质：{video_quality}")
                # 调试输出
                print(f"正在插入：分类[{category}] 文件名[{video_name}] 路径[{video_path}]")

                # 确定权限组ID（1=普通用户，2=VIP用户）
                group_id = 2 if is_vip else 1

                # 获取或创建磁盘记录
                config_data = query_database.get_video_config()
                if config_data and config_data.get('video_base'):
                    video_base = Path(config_data['video_base'])
                    if not video_base.is_absolute():
                        raise ValueError("video_base必须配置为绝对路径，例如: D:\\media\\videos")
                    
                    mount_path = str(video_base.root)
                    disk_drive = mount_path[0].upper()
                    disk_id = get_or_create_disk(mount_path, disk_drive)
                    if disk_id:
                        # 计算存储根路径
                        storage_root = str(video_base).replace(mount_path, "").replace("\\", "/")
                        if storage_root.startswith("/"):
                            storage_root = storage_root[1:]
                        if not storage_root.endswith("/") and storage_root:
                            storage_root += "/"
                        if video_path and video_path != "":
                            if storage_root:
                                storage_root = storage_root + video_path + "/"
                            else:
                                storage_root = video_path + "/"
                        
                        # 插入或获取视频集合
                        collection_id = insert_video_collection(
                            disk_id=disk_id,
                            collection_name=category,
                            storage_root=storage_root,
                            group_id=group_id,
                            description=f"扫描添加的分类: {category}"
                        )
                        
                        if collection_id:
                            # 构建相对路径
                            if video_path and video_path != "":
                                relative_path = f"{video_path}/{video_name}".replace("\\", "/")
                            else:
                                relative_path = video_name
                                
                            # 插入视频条目
                            insert_video_item(
                                collection_id=collection_id,
                                relative_path=relative_path,
                                video_name=video_name,
                                video_duration=video_duration,
                                video_quality=video_quality
                            )
                
                # 更新统计结果
                valid_categories.add(category)
                result['videos_added'] += 1

            except Exception as e:
                print(f"插入失败：{root / filename} | 错误：{str(e)}")
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


def normalize_path(path):
    """
    使用Path对象规范化路径，确保路径格式一致性
    """
    if path is None:
        return None

    # 创建Path对象处理路径
    try:
        path_obj = Path(path)
        # 检查路径是否存在
        if path_obj.exists():
            return path_obj
        # 尝试其他形式的路径
        alt_path = Path(str(path).replace('\\', '/'))
        if alt_path.exists():
            return alt_path
        # 即使路径不存在也返回Path对象
        return path_obj
    except:
        # 出错时返回原始字符串
        return path
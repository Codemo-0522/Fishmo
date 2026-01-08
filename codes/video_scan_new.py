import os
from pathlib import Path
from pymediainfo import MediaInfo
from codes.video_queries_new import (
    insert_video_collection, insert_video_item, get_or_create_disk, smart_fix_video_path
)
from codes import function as fun
from codes.query_database import db, get_video_config

def scan_and_process_videos_new(app, parent_dir, is_vip=False, progress_callback=None, thumbnail_dir=None):
    """
    扫描并处理视频文件 - 新版本支持跨根目录和缩略图自动映射
    
    Args:
        app: Flask应用实例
        parent_dir: 要扫描的目录(Path对象或字符串)
        is_vip: 是否为VIP视频（默认False）
        progress_callback: 进度更新回调函数
        thumbnail_dir: 缩略图目录(Path对象或字符串，可选)
    
    Returns:
        dict: 扫描结果统计
    """
    result = {
        'categories_added': 0,
        'videos_added': 0,
        'failed_count': 0,
        'disk_paths': []  # 记录涉及的磁盘路径
    }
    
    try:
        # 确保目录存在且为Path对象
        if isinstance(parent_dir, str):
            parent_dir = Path(parent_dir)
            
        if not parent_dir.exists():
            raise Exception(f'目录不存在: {parent_dir}')

        # 1. 分析磁盘和路径信息
        print(f"开始分析扫描目录: {parent_dir}")
        
        # 提取磁盘信息（参考图片模块的正确做法）
        if parent_dir.is_absolute():
            if os.name == 'nt':  # Windows系统
                if not parent_dir.drive:
                    raise Exception("需要包含盘符的绝对路径")
                disk_drive = parent_dir.drive[0].upper()  # 例如 "C"
                mount_path = f"{disk_drive}:\\"  # 例如 "C:\"
            else:  # Linux/Mac
                disk_drive = 'root'
                mount_path = '/'
        else:
            raise Exception("必须提供绝对路径")
            
        # 获取或创建磁盘记录
        disk_id = get_or_create_disk(mount_path, disk_drive)
        if not disk_id:
            raise Exception(f"无法创建磁盘记录: {mount_path}")
            
        result['disk_paths'].append(mount_path)
        print(f"磁盘记录: ID={disk_id}, 挂载路径={mount_path}")

        # 2. 处理缩略图目录（如果提供）
        thumbnail_disk_id = None
        thumbnail_storage_root = None
        
        if thumbnail_dir:
            if isinstance(thumbnail_dir, str):
                thumbnail_dir = Path(thumbnail_dir)
            
            if thumbnail_dir.exists():
                # 提取缩略图磁盘信息
                if thumbnail_dir.is_absolute():
                    if os.name == 'nt':  # Windows系统
                        thumbnail_disk_drive = thumbnail_dir.drive[0].upper()
                        thumbnail_mount_path = f"{thumbnail_disk_drive}:\\"
                    else:  # Linux/Mac
                        thumbnail_disk_drive = 'root'
                        thumbnail_mount_path = '/'
                    
                    # 获取或创建缩略图磁盘记录
                    thumbnail_disk_id = get_or_create_disk(thumbnail_mount_path, thumbnail_disk_drive)
                    
                    # 计算缩略图存储根路径
                    try:
                        thumbnail_relative_to_mount = thumbnail_dir.relative_to(Path(thumbnail_mount_path))
                        thumbnail_storage_root = thumbnail_relative_to_mount.as_posix() + "/"
                        print(f"缩略图磁盘: ID={thumbnail_disk_id}, 挂载路径={thumbnail_mount_path}")
                        print(f"缩略图存储根路径: {thumbnail_storage_root}")
                    except ValueError:
                        print(f"缩略图路径必须在{thumbnail_mount_path}目录下")
                        thumbnail_disk_id = None
                        thumbnail_storage_root = None
            else:
                print(f"缩略图目录不存在，将在需要时创建: {thumbnail_dir}")

        # 3. 计算存储根路径（相对于磁盘挂载点）- 参考图片模块的做法
        try:
            relative_to_mount = parent_dir.relative_to(Path(mount_path))
        except ValueError:
            raise Exception(f'路径必须在{mount_path}目录下')
        
        storage_root = relative_to_mount.as_posix() + "/"
        print(f"计算存储根路径：{storage_root}")

        # 4. 支持的视频扩展名
        VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mkv', '.mov', '.flv', '.wmv', '.rm', '.rmvb', '.3gp', '.webm'}
        
        # 记录有效分类（避免空目录）
        valid_categories = set()
        
        # 🎯 扫描视频文件夹 - 与图片管理保持一致的逻辑
        def scan_video_folders(scan_path):
            """
            简单直接的扫描方式：
            - 遍历所有文件夹（包括多级嵌套）
            - 如果文件夹内有视频文件，就将该文件夹作为一个视频集合
            - 文件夹名 = 集合名，文件夹内的视频 = 集合内容
            
            返回: {collection_name: [video_files]}
            """
            collections = {}
            
            # 递归遍历所有目录
            for current_dir in scan_path.rglob('*'):
                if not current_dir.is_dir() or current_dir.name.startswith('.'):
                    continue
                    
                # 查找当前目录下的视频文件（不递归，只看直接子文件）
                video_files = []
                for file_path in current_dir.iterdir():
                    if file_path.is_file() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                        video_files.append(file_path)
                
                # 如果当前目录有视频，就创建一个集合
                if video_files:
                    collection_name = current_dir.name
                    
                    # 处理重名情况：如果已存在同名集合，添加路径信息区分
                    if collection_name in collections:
                        # 使用相对路径作为唯一标识
                        try:
                            rel_path = current_dir.relative_to(scan_path)
                            collection_name = str(rel_path).replace('\\', '_').replace('/', '_')
                        except ValueError:
                            collection_name = f"{current_dir.name}_{len(collections)}"
                    
                    collections[collection_name] = video_files
                    print(f"📂 发现视频集合: {collection_name} ({len(video_files)} 个视频)")
            
            # 特殊处理：如果根目录直接有视频
            root_videos = []
            for file_path in scan_path.iterdir():
                if file_path.is_file() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                    root_videos.append(file_path)
            
            if root_videos:
                collection_name = scan_path.name
                # 如果已有同名集合，添加后缀区分
                if collection_name in collections:
                    collection_name = f"{scan_path.name}_根目录"
                collections[collection_name] = root_videos
                print(f"📂 发现根目录视频集合: {collection_name} ({len(root_videos)} 个视频)")
            
            print(f"🔍 总共发现 {len(collections)} 个视频集合")
            
            # 🎯 调试输出：显示扫描结果的详细信息
            if collections:
                print("📋 扫描结果详情:")
                for name, files in collections.items():
                    print(f"  📂 视频集合: {name}")
                    for i, file_path in enumerate(files[:3]):  # 只显示前3个文件
                        print(f"    🎬 {file_path.name}")
                    if len(files) > 3:
                        print(f"    ... 还有 {len(files) - 3} 个文件")
            
            return collections
        
        # 4. 使用新的扫描逻辑
        print("正在扫描视频文件夹...")
        video_collections = scan_video_folders(parent_dir)
        
        if not video_collections:
            print("未发现任何视频文件")
            return result
        
        # 计算总文件数
        total_files = sum(len(files) for files in video_collections.values())
        total_collections = len(video_collections)
        print(f"📊 扫描结果: {total_collections} 个集合，{total_files} 个视频文件")
        
        # 确定权限组ID（1=普通用户，2=VIP用户）
        group_id = 2 if is_vip else 1
        
        # 🎯 5. 处理每个视频集合 - 修复路径计算问题
        processed_collections = {}  # 缓存已创建的集合
        processed_files = 0
        
        collection_names = list(video_collections.keys())
        
        for i, collection_name in enumerate(collection_names):
            video_files = video_collections[collection_name]
            
            print(f"\n📂 处理视频集合：{collection_name} ({len(video_files)} 个视频)")
            
            # 🎯 计算该集合的正确存储根路径
            if video_files:
                # 使用第一个视频文件所在的目录来计算存储根路径
                first_video = video_files[0]
                video_dir = first_video.parent
                
                try:
                    # 计算相对于挂载点的路径
                    relative_to_mount = video_dir.relative_to(Path(mount_path))
                    collection_storage_root = relative_to_mount.as_posix() + "/"
                except ValueError:
                    # 如果无法计算相对路径，使用默认值
                    collection_storage_root = storage_root
                
                print(f"📁 集合存储根路径: {collection_storage_root}")
                print(f"🔍 调试信息:")
                print(f"   mount_path: {mount_path}")
                print(f"   video_dir: {video_dir}")
                print(f"   parent_dir: {parent_dir}")
                print(f"   storage_root: {storage_root}")
            else:
                collection_storage_root = storage_root
            
            # 创建或获取视频集合
            collection_key = f"{disk_id}_{collection_name}_{collection_storage_root}"  # 包含路径信息避免冲突
            if collection_key not in processed_collections:
                collection_id = insert_video_collection(
                    disk_id=disk_id,
                    collection_name=collection_name,
                    storage_root=collection_storage_root,  # 🎯 使用正确的存储根路径
                    group_id=group_id,
                    description=f"扫描创建的视频集合: {collection_name}",
                    thumbnail_disk_id=thumbnail_disk_id,
                    thumbnail_root=thumbnail_storage_root
                )
                
                if not collection_id:
                    print(f"❌ 无法创建视频集合: {collection_name}")
                    result['failed_count'] += len(video_files)
                    continue
                    
                processed_collections[collection_key] = collection_id
                valid_categories.add(collection_name)
                print(f"✅ 创建视频集合: {collection_name} (ID: {collection_id})")
                result['categories_added'] += 1
            else:
                collection_id = processed_collections[collection_key]
            
            # 🎯 处理该集合中的每个视频文件
            for file_path in video_files:
                try:
                    processed_files += 1
                    
                    # 更新进度
                    if progress_callback:
                        percentage = int((processed_files / total_files) * 100)
                        progress_callback(percentage, file_path.name)
                    
                    # 🎯 计算正确的相对路径 - 相对于集合目录的路径
                    try:
                        # 相对于集合目录的路径
                        relative_to_collection = file_path.relative_to(video_dir).as_posix()
                        # 修复路径前缀，确保与查询逻辑一致
                        clean_relative_path, _, _ = smart_fix_video_path(relative_to_collection)
                    except ValueError:
                        # 如果无法计算相对路径，使用文件名
                        clean_relative_path = file_path.name
                    print(f"🎬 处理视频: {collection_name}/{file_path.name} -> {clean_relative_path}")

                    # 🎯 7. 获取视频元信息
                    full_video_path = file_path  # 使用正确的文件路径
                    file_size = full_video_path.stat().st_size if full_video_path.exists() else None
                    
                    video_duration = None
                    video_quality = None
                    video_width = None
                    video_height = None
                    video_bitrate = None
                    video_fps = None
                    video_codec = None
                    
                    # 🎯 获取视频元信息
                    try:
                        print(f"分析视频元信息: {full_video_path}")
                        media_info = MediaInfo.parse(str(full_video_path))
                        
                        for track in media_info.tracks:
                            if track.track_type == "Video":
                                if track.duration:
                                    video_duration = fun.format_duration(track.duration)
                                if track.width and track.height:
                                    video_width = track.width
                                    video_height = track.height
                                    video_quality = fun.get_quality_label(track.width, track.height)
                                if track.bit_rate:
                                    video_bitrate = track.bit_rate
                                if track.frame_rate:
                                    video_fps = float(track.frame_rate)
                                if track.codec:
                                    video_codec = track.codec
                                break
                                
                        print(f"视频信息: {video_quality}, {video_duration}, {video_width}x{video_height}")
                        
                    except Exception as e:
                        print(f"获取视频元信息失败: {str(e)}")

                    # 🎯 8. 计算缩略图路径（如果提供了缩略图目录）
                    thumbnail_path = None
                    if thumbnail_storage_root:
                        # 缩略图路径与视频路径对应：集合名/子目录结构/video_name.jpg
                        video_stem = file_path.stem
                        # 使用集合名作为顶级目录，确保不同集合的缩略图分开存储
                        thumbnail_path = str(Path(collection_name) / Path(clean_relative_path).parent / f"{video_stem}.jpg").replace("\\", "/")
                        print(f"计算缩略图路径: {thumbnail_path}")

                        # 确保缩略图目录存在
                        if thumbnail_dir:
                            full_thumbnail_dir = Path(thumbnail_dir) / Path(clean_relative_path).parent
                            try:
                                os.makedirs(full_thumbnail_dir, exist_ok=True)
                                print(f"确保缩略图目录存在: {full_thumbnail_dir}")
                            except Exception as e:
                                print(f"创建缩略图目录失败: {str(e)}")

                    # 🎯 9. 插入视频条目
                    success = insert_video_item(
                        collection_id=collection_id,
                        relative_path=clean_relative_path,
                        video_name=file_path.name,
                        file_size=file_size,
                        video_duration=video_duration,
                        video_quality=video_quality,
                        video_width=video_width,
                        video_height=video_height,
                        video_bitrate=video_bitrate,
                        video_fps=video_fps,
                        video_codec=video_codec,
                        thumbnail_path=thumbnail_path
                    )
                    
                    if success:
                        result['videos_added'] += 1
                        print(f"✅ 成功插入视频: {collection_name}/{file_path.name}")
                    else:
                        result['failed_count'] += 1
                        print(f"❌ 插入视频失败: {collection_name}/{file_path.name}")

                except Exception as e:
                    print(f"❌ 处理视频失败：{file_path} | 错误：{str(e)}")
                    result['failed_count'] += 1
                    continue

        # 最终统计结果已在集合创建时更新
        print(f"扫描完成，结果：{result}")
        return result

    except Exception as e:
        print(f"扫描视频时发生错误: {str(e)}")
        raise

def migrate_from_old_videos():
    """
    从旧的video_info表迁移数据到新表结构
    
    Returns:
        dict: 迁移结果
    """
    try:
        result = {
            'migrated_categories': 0,
            'migrated_videos': 0,
            'failed_count': 0
        }
        
        # 获取配置信息
        config_data = get_video_config()
        if not config_data or not config_data.get('video_base'):
            raise Exception("未找到视频根路径配置")
            
        video_base = Path(config_data['video_base'])
        
        # 提取磁盘信息
        if not video_base.is_absolute():
            raise ValueError("video_base必须配置为绝对路径，例如: D:\\media\\videos")
        
        mount_path = str(video_base.root)
        disk_drive = mount_path[0].upper()
            
        # 获取或创建磁盘记录
        disk_id = get_or_create_disk(mount_path, disk_drive)
        if not disk_id:
            raise Exception("无法创建磁盘记录")
        
        # 计算基础存储根路径
        base_storage_root = str(video_base).replace(mount_path, "").replace("\\", "/")
        if base_storage_root.startswith("/"):
            base_storage_root = base_storage_root[1:]
        if base_storage_root and not base_storage_root.endswith("/"):
            base_storage_root += "/"
        
        with db.connect() as conn:
            with conn.cursor() as cursor:
                # 获取所有旧视频记录
                cursor.execute("""
                    SELECT DISTINCT category, video_path, video_name, video_duration, 
                           video_quality, group_id, update_time
                    FROM video_info
                    ORDER BY category, video_path, video_name
                """)
                
                old_videos = cursor.fetchall()
                processed_collections = {}
                
                for video in old_videos:
                    try:
                        category = video[0]
                        video_path = video[1] or ""
                        video_name = video[2]
                        video_duration = video[3]
                        video_quality = video[4]
                        group_id = video[5] or 1
                        
                        # 构建存储根路径
                        if video_path:
                            storage_root = base_storage_root + video_path + "/"
                            relative_path = f"{video_path}/{video_name}"
                        else:
                            storage_root = base_storage_root
                            relative_path = video_name
                        
                        # 创建或获取集合
                        collection_key = f"{category}_{storage_root}"
                        if collection_key not in processed_collections:
                            collection_id = insert_video_collection(
                                disk_id=disk_id,
                                collection_name=category,
                                storage_root=storage_root,
                                group_id=group_id,
                                description=f"从旧系统迁移: {category}"
                            )
                            
                            if collection_id:
                                processed_collections[collection_key] = collection_id
                                result['migrated_categories'] += 1
                            else:
                                print(f"创建集合失败: {category}")
                                result['failed_count'] += 1
                                continue
                        else:
                            collection_id = processed_collections[collection_key]
                        
                        # 插入视频条目
                        success = insert_video_item(
                            collection_id=collection_id,
                            relative_path=relative_path.replace("\\", "/"),
                            video_name=video_name,
                            video_duration=video_duration,
                            video_quality=video_quality
                        )
                        
                        if success:
                            result['migrated_videos'] += 1
                        else:
                            result['failed_count'] += 1
                            
                    except Exception as e:
                        print(f"迁移视频失败: {video} | 错误: {str(e)}")
                        result['failed_count'] += 1
        
        print(f"迁移完成: {result}")
        return result
        
    except Exception as e:
        print(f"迁移过程出错: {str(e)}")
        raise

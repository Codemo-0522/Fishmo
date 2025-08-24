import os
from pathlib import Path
import mysql.connector
from mysql.connector import Error
import logging
from mutagen import File
from mutagen.easyid3 import EasyID3
import time
from codes import env_loader

class AudioProcessor:
    def __init__(self):
        self.db_config = env_loader.db_config
        self.logger = logging.getLogger(__name__)
        self.progress = {'percentage': 0, 'current_file': ''}

    def connect_db(self):
        try:
            connection = mysql.connector.connect(**self.db_config)
            return connection
        except Error as e:
            self.logger.error(f"数据库连接失败: {e}")
            raise

    def get_or_create_disk_id(self, cursor, mount_path, disk_drive):
        """获取或创建磁盘ID"""
        try:
            # 检查磁盘是否已存在
            cursor.execute(
                "SELECT disk_id FROM storage_disk WHERE disk_drive = %s AND mount_path = %s",
                (disk_drive, str(mount_path))
            )
            result = cursor.fetchone()
            
            if result:
                return result[0]
            
            # 如果不存在，创建新记录
            cursor.execute(
                "INSERT INTO storage_disk (disk_drive, mount_path) VALUES (%s, %s)",
                (disk_drive, str(mount_path))
            )
            return cursor.lastrowid
            
        except Error as e:
            self.logger.error(f"获取磁盘ID失败: {e}")
            raise

    def extract_audio_metadata(self, file_path):
        """提取音频文件的元数据 - 增强版"""
        try:
            audio = File(file_path, easy=True)
            if audio is None:
                return None

            metadata = {
                'title': None,
                'artist': None,
                'album': None,
                'genre': None,
                'year': None,
                'duration': None
            }

            # 🎯 尝试读取ID3标签
            if isinstance(audio, EasyID3) or hasattr(audio, 'tags'):
                tags = audio.tags if hasattr(audio, 'tags') else audio
                if tags:
                    # 处理列表类型的标签值
                    def get_first_value(tag_dict, key):
                        value = tag_dict.get(key, [None])[0]
                        return value if value else None
                    
                    metadata.update({
                        'title': get_first_value(tags, 'title'),
                        'artist': get_first_value(tags, 'artist'),
                        'album': get_first_value(tags, 'album'),
                        'genre': get_first_value(tags, 'genre'),
                        'year': get_first_value(tags, 'date') or get_first_value(tags, 'year')
                    })

            # 🎯 获取音频时长
            if hasattr(audio.info, 'length'):
                metadata['duration'] = int(audio.info.length)
            elif hasattr(audio.info, 'duration'):
                metadata['duration'] = int(audio.info.duration)

            # 🎯 如果没有标题，使用文件名（不含扩展名）
            if not metadata['title']:
                metadata['title'] = file_path.stem

            # 🎯 如果没有艺术家信息，尝试从专辑目录名推断
            if not metadata['artist'] and file_path.parent.name:
                # 如果专辑目录名看起来像艺术家名（不包含特殊字符）
                artist_candidate = file_path.parent.name
                if not any(char in artist_candidate for char in ['\\', '/', ':', '*', '?', '"', '<', '>', '|']):
                    metadata['artist'] = artist_candidate

            return metadata

        except Exception as e:
            self.logger.error(f"提取音频元数据失败: {e}")
            # 🎯 返回基本元数据（使用文件名）
            return {
                'title': file_path.stem,
                'artist': None,
                'album': None,
                'genre': None,
                'year': None,
                'duration': None
            }

    def update_progress(self, percentage, current_file):
        """更新处理进度"""
        self.progress['percentage'] = percentage
        self.progress['current_file'] = current_file

    def get_progress(self):
        """获取当前进度"""
        return self.progress

    def process_audio_data(self, root_path, is_vip=False, progress_callback=None):
        """处理音频文件数据 - 支持复杂目录结构"""
        connection = None
        cursor = None
        try:
            root_path = Path(root_path)
            if not root_path.exists():
                return {'status': 'error', 'message': f'目录不存在: {root_path}'}

            try:
                connection = self.connect_db()
                cursor = connection.cursor()

                # 获取磁盘信息
                mount_path = root_path.parent
                disk_drive = root_path.drive.upper().replace(':', '') or 'C'
                disk_id = self.get_or_create_disk_id(cursor, mount_path, disk_drive)
            except Exception as e:
                self.logger.error(f"数据库连接或磁盘信息获取失败: {e}")
                return {'status': 'error', 'message': f'数据库连接失败: {str(e)}'}

            total_files = 0
            processed_files = 0
            start_time = time.time()

            # 🎯 支持的音频扩展名
            AUDIO_EXTENSIONS = {'.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.wma'}

            # 🎯 首先计算总文件数（递归扫描所有音频文件）
            for file_path in root_path.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in AUDIO_EXTENSIONS:
                    total_files += 1

            if total_files == 0:
                return {'status': 'error', 'message': '未找到音频文件'}

            # 🎯 扫描音频文件夹 - 支持复杂目录结构
            def scan_audio_folders(scan_path):
                """
                扫描音频文件夹，支持多种目录结构：
                1. 根目录直接有音频文件
                2. 根目录有子文件夹，子文件夹内有音频文件
                3. 多级嵌套目录，每个包含音频的文件夹作为一个专辑
                
                返回: {collection_name: [audio_files]}
                """
                collections = {}
                
                # 递归遍历所有目录
                for current_dir in scan_path.rglob('*'):
                    if not current_dir.is_dir() or current_dir.name.startswith('.'):
                        continue
                        
                    # 查找当前目录下的音频文件（不递归，只看直接子文件）
                    audio_files = []
                    for file_path in current_dir.iterdir():
                        if file_path.is_file() and file_path.suffix.lower() in AUDIO_EXTENSIONS:
                            audio_files.append(file_path)
                    
                    # 如果当前目录有音频，就创建一个集合
                    if audio_files:
                        collection_name = current_dir.name
                        
                        # 处理重名情况：如果已存在同名集合，添加路径信息区分
                        if collection_name in collections:
                            # 使用相对路径作为唯一标识
                            try:
                                rel_path = current_dir.relative_to(scan_path)
                                collection_name = str(rel_path).replace('\\', '_').replace('/', '_')
                            except ValueError:
                                collection_name = f"{current_dir.name}_{len(collections)}"
                        
                        collections[collection_name] = audio_files
                        self.logger.info(f"📂 发现音频集合: {collection_name} ({len(audio_files)} 个音频)")
                
                # 🎯 特殊处理：如果根目录直接有音频文件
                root_audios = []
                for file_path in scan_path.iterdir():
                    if file_path.is_file() and file_path.suffix.lower() in AUDIO_EXTENSIONS:
                        root_audios.append(file_path)
                
                if root_audios:
                    collection_name = scan_path.name
                    # 如果已有同名集合，添加后缀区分
                    if collection_name in collections:
                        collection_name = f"{scan_path.name}_root"
                    
                    collections[collection_name] = root_audios
                    self.logger.info(f"📂 发现根目录音频集合: {collection_name} ({len(root_audios)} 个音频)")
                
                return collections

            # 🎯 扫描所有音频集合
            audio_collections = scan_audio_folders(root_path)
            
            if not audio_collections:
                return {'status': 'error', 'message': '未找到有效的音频集合'}

            # 🎯 处理每个音频集合
            for collection_name, audio_files in audio_collections.items():
                try:
                    cursor.execute("SAVEPOINT sp_collection")
                    
                    # 获取第一个音频文件的相对路径来确定存储根路径
                    first_audio = audio_files[0]
                    collection_dir = first_audio.parent
                    storage_root = str(collection_dir.relative_to(mount_path))
                    storage_root = storage_root.replace('\\', '/')  # 统一使用正斜杠

                    # 检查是否存在封面图片
                    cover_path = None
                    for cover_file in collection_dir.glob('*.[Jj][Pp][Gg]'):
                        cover_path = str(cover_file.relative_to(mount_path))
                        cover_path = cover_path.replace('\\', '/')  # 统一使用正斜杠
                        break

                    # 插入专辑信息
                    cursor.execute("""
                        INSERT INTO audio_collection 
                            (disk_id, collection_name, storage_root, group_id, cover_path)
                        VALUES (%s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            disk_id = VALUES(disk_id),
                            storage_root = VALUES(storage_root),
                            group_id = VALUES(group_id),
                            cover_path = VALUES(cover_path)
                    """, (disk_id, collection_name, storage_root, 2 if is_vip else 1, cover_path))

                    collection_id = cursor.lastrowid

                    # 处理音频文件
                    file_count = 0
                    for file_path in audio_files:
                        try:
                            relative_path = str(file_path.relative_to(mount_path))
                            relative_path = relative_path.replace('\\', '/')  # 统一使用正斜杠
                            file_size = file_path.stat().st_size
                            
                            # 🎯 更新进度（同时更新内部进度和外部回调）
                            processed_files += 1
                            percentage = int((processed_files / total_files) * 100)
                            self.update_progress(percentage, str(file_path))
                            
                            # 如果提供了进度回调函数，调用它（用于实时SSE更新）
                            if progress_callback:
                                progress_callback(percentage, str(file_path.name))
                            
                            # 提取音频元数据
                            metadata = self.extract_audio_metadata(file_path)
                            if metadata:
                                cursor.execute("""
                                    INSERT INTO audio_item 
                                        (collection_id, relative_path, file_size, duration, 
                                         title, artist, album, genre, year)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                    ON DUPLICATE KEY UPDATE
                                        file_size = VALUES(file_size),
                                        duration = VALUES(duration),
                                        title = VALUES(title),
                                        artist = VALUES(artist),
                                        album = VALUES(album),
                                        genre = VALUES(genre),
                                        year = VALUES(year)
                                """, (
                                    collection_id, relative_path, file_size,
                                    metadata['duration'], metadata['title'],
                                    metadata['artist'], metadata['album'],
                                    metadata['genre'], metadata['year']
                                ))

                                if cursor.rowcount > 0:
                                    file_count += 1

                        except Exception as e:
                            self.logger.error(f"音频文件处理失败：{file_path} | 错误：{str(e)}")
                            continue

                    self.logger.info(f"插入 {file_count} 个音频文件到集合: {collection_name}")

                except Exception as e:
                    self.logger.error(f"专辑处理失败：{collection_name} | 错误：{str(e)}")
                    if cursor:
                        cursor.execute("ROLLBACK TO SAVEPOINT sp_collection")
                    continue

            if connection:
                connection.commit()
            end_time = time.time()
            
            return {
                'status': 'success',
                'message': f'共处理{processed_files}个音频文件，创建{len(audio_collections)}个专辑',
                'processing_time': f'{end_time - start_time:.2f}秒'
            }

        except Exception as e:
            self.logger.error(f"音频处理失败: {str(e)}")
            if connection:
                connection.rollback()
            return {'status': 'error', 'message': str(e)}

        finally:
            if cursor:
                cursor.close()
            if connection:
                connection.close() 
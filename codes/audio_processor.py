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
        """提取音频文件的元数据"""
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

            # 尝试读取ID3标签
            if isinstance(audio, EasyID3) or hasattr(audio, 'tags'):
                tags = audio.tags if hasattr(audio, 'tags') else audio
                if tags:
                    metadata.update({
                        'title': tags.get('title', [None])[0],
                        'artist': tags.get('artist', [None])[0],
                        'album': tags.get('album', [None])[0],
                        'genre': tags.get('genre', [None])[0],
                        'year': tags.get('date', [None])[0]
                    })

            # 获取音频时长
            if hasattr(audio.info, 'length'):
                metadata['duration'] = int(audio.info.length)

            return metadata

        except Exception as e:
            self.logger.error(f"提取音频元数据失败: {e}")
            return None

    def update_progress(self, percentage, current_file):
        """更新处理进度"""
        self.progress['percentage'] = percentage
        self.progress['current_file'] = current_file

    def get_progress(self):
        """获取当前进度"""
        return self.progress

    def process_audio_data(self, root_path, is_vip=False, progress_callback=None):
        """处理音频文件数据"""
        try:
            root_path = Path(root_path)
            if not root_path.exists():
                return {'status': 'error', 'message': '目录不存在'}

            connection = self.connect_db()
            cursor = connection.cursor()

            # 获取磁盘信息
            mount_path = root_path.parent
            disk_drive = root_path.drive.upper().replace(':', '') or 'C'
            disk_id = self.get_or_create_disk_id(cursor, mount_path, disk_drive)

            total_files = 0
            processed_files = 0
            start_time = time.time()

            # 首先计算总文件数
            for collection_dir in root_path.iterdir():
                if collection_dir.is_dir():
                    for file_path in collection_dir.rglob('*'):
                        if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav', '.flac', '.m4a', '.ogg']:
                            total_files += 1

            # 遍历目录
            for collection_dir in root_path.iterdir():
                if not collection_dir.is_dir():
                    continue

                try:
                    cursor.execute("SAVEPOINT sp_collection")
                    collection_name = collection_dir.name
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
                    for file_path in collection_dir.rglob('*'):
                        if file_path.is_file() and file_path.suffix.lower() in ['.mp3', '.wav', '.flac', '.m4a', '.ogg']:
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

                    self.logger.info(f"插入 {file_count} 个音频文件")

                except Exception as e:
                    self.logger.error(f"专辑处理失败：{collection_name} | 错误：{str(e)}")
                    cursor.execute("ROLLBACK TO SAVEPOINT sp_collection")
                    continue

            connection.commit()
            end_time = time.time()
            
            return {
                'status': 'success',
                'message': f'共处理{processed_files}个音频文件',
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
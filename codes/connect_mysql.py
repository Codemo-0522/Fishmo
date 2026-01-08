import os
from pathlib import Path
import pymysql
from codes import env_loader
import json
from flask import current_app

# 数据库连接和操作
class Connect_mysql:
    def __init__(self):
        self.host = env_loader.mysql_host
        self.port = env_loader.mysql_port
        self.user = env_loader.mysql_user
        self.password = env_loader.mysql_password
        self.database = env_loader.mysql_database
        self.charset = env_loader.mysql_charset

    # 数据库连接
    def connect(self):
        try:
            return pymysql.connect(host=self.host, port=self.port, user=self.user,
                                   passwd=self.password, db=self.database, charset=self.charset)
        except Exception as e:
            return json.dumps({'error': "数据库连接失败"}, ensure_ascii=False)

    # 查询多条记录
    def fetch_all_records(self, SQL):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL)
                    result = cursor.fetchall()
            return result
        except Exception as e:
            return {'error': "数据库查询失败"}

    # 查询单条记录
    def fetch_one_record(self, SQL,params=None):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL,params)
            return cursor.fetchone()
        except Exception as e:
            return {'error': "数据库查询失败"}

    def alter_data(self, SQL, params=None):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    cursor.execute(SQL, params)
                    db.commit()  # 手动提交事务
                return cursor.rowcount  # 返回受影响的行数
        except Exception as e:
            db.rollback()  # 出现异常时回滚事务
            return json.dumps({'error': "数据库更新失败"}, ensure_ascii=False)

    # 新增：清空表的方法
    def clear_table(self, table_name):
        try:
            with self.connect() as db:
                with db.cursor() as cursor:
                    truncate_query = f"TRUNCATE TABLE {table_name}"
                    cursor.execute(truncate_query)
                    db.commit()
                return True
        except Exception as e:
            if isinstance(db, pymysql.connections.Connection):
                db.rollback()
            return json.dumps({'error': f"清空表 {table_name} 失败: {str(e)}"}, ensure_ascii=False)

    # 在 Connect_mysql 类中添加以下方法
    def process_image_data(self, root_path, is_vip):
        print(f"开始处理数据结构，传入的参数：{root_path}  {is_vip}")
        try:
            # ================== 参数校验 ==================
            path = Path(root_path).resolve()
            if not path.exists():
                return {'status': 'error', 'message': f'目录不存在: {root_path}'}
            if not path.is_dir():
                return {'status': 'error', 'message': '需要目录路径'}
            print(f"解析后绝对路径：{path}")

            # ================== 跨平台路径处理 ==================
            if os.name == 'nt':  # Windows系统
                if not path.drive:
                    return {'status': 'error', 'message': '需要包含盘符的绝对路径'}
                disk_drive = path.drive[0]
                mount_path = Path(f"{disk_drive}:\\").resolve()
            else:  # Linux/Mac
                disk_drive = 'root'
                mount_path = Path('/').resolve()

            try:
                relative_to_mount = path.relative_to(mount_path)
            except ValueError:
                return {'status': 'error', 'message': f'路径必须在{mount_path}目录下'}

            storage_root = relative_to_mount.as_posix()+"/"
            print(f"计算存储根路径：{storage_root}")

            # ================== 数据库事务 ==================
            with self.connect() as db:
                cursor = db.cursor()
                db.begin()

                try:
                    #磁盘信息处理
                    cursor.execute("""
                        INSERT INTO storage_disk 
                            (disk_drive, mount_path, is_active)
                        VALUES (%s, %s, 1)
                        ON DUPLICATE KEY UPDATE 
                            is_active = VALUES(is_active)  -- 只更新必要字段
                        """, (disk_drive, mount_path.as_posix()))

                    # 获取磁盘ID
                    cursor.execute("""
                        SELECT disk_id FROM storage_disk 
                        WHERE disk_drive = %s AND mount_path = %s
                        """, (disk_drive, mount_path.as_posix()))
                    disk_row = cursor.fetchone()
                    disk_id = disk_row[0] if disk_row else None
                    if not disk_id:
                        raise ValueError("无法获取磁盘ID")

                    # 2. 遍历套图目录
                    total_files = 0
                    for collection_dir in path.iterdir():
                        if not collection_dir.is_dir() or collection_dir.name.startswith('.'):
                            continue

                        collection_name = collection_dir.name
                        print(f"\n处理套图：{collection_name}")

                        cursor.execute("SAVEPOINT sp_collection")
                        try:
                            # 插入套图信息
                            cursor.execute("""
                                INSERT INTO image_collection 
                                    (disk_id, collection_name, storage_root, group_id)
                                VALUES (%s, %s, %s, %s)
                                ON DUPLICATE KEY UPDATE 
                                    collection_id = LAST_INSERT_ID(collection_id)
                                """, (disk_id, collection_name, storage_root, 2 if is_vip else 1))

                            collection_id = cursor.lastrowid
                            print(f"套图ID：{collection_id}")

                            # 3. 处理图片文件
                            file_count = 0
                            for file_path in collection_dir.rglob('*'):
                                if file_path.is_file():
                                    try:
                                        relative_path = file_path.relative_to(path).as_posix()
                                        file_size = file_path.stat().st_size

                                        cursor.execute("""
                                            INSERT IGNORE INTO image_item 
                                                (collection_id, relative_path, file_size)
                                            VALUES (%s, %s, %s)
                                            """, (collection_id, relative_path, file_size))

                                        if cursor.rowcount == 1:
                                            file_count += 1
                                            total_files += 1
                                    except Exception as e:
                                        print(f"文件处理失败：{file_path} | 错误：{str(e)}")
                                        continue

                            print(f"插入 {file_count} 个文件")
                            print(f"示例路径：{mount_path.as_posix()}/{storage_root}/{relative_path}")

                        except Exception as e:
                            print(f"套图处理失败：{collection_name} | 回滚操作")
                            cursor.execute("ROLLBACK TO SAVEPOINT sp_collection")
                            continue

                    db.commit()
                    res={
                        'status': 'success',
                        'message': f'共处理{total_files}个文件',
                        'storage_root': f"{mount_path.as_posix()}/{storage_root}"
                    }
                    print(res)
                    return res

                except Exception as e:
                    db.rollback()
                    return {'status': 'error', 'message': f'数据库操作失败: {str(e)}'}
                finally:
                    cursor.close()

        except Exception as e:
            return {'status': 'error', 'message': f'系统错误: {str(e)}'}

    def process_image_data_with_progress(self, root_path, is_vip, progress_callback=None):
        """带进度更新的图片数据处理"""
        print(f"开始处理数据结构（带进度），传入的参数：{root_path}  {is_vip}")
        
        # 🎯 定义支持的图片格式（全面覆盖）
        SUPPORTED_IMAGE_FORMATS = {
            # 常见格式
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
            # RAW格式
            '.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2',
            # 其他格式
            '.tiff', '.tif', '.svg', '.ico', '.heic', '.heif',
            '.avif', '.jxl', '.jp2', '.jpx', '.j2k', '.j2c'
        }
        print(f"📷 支持的图片格式: {sorted(SUPPORTED_IMAGE_FORMATS)}")
        
        # 🎯 优先使用传入的回调函数，如果没有则使用打印版本
        if progress_callback is None:
            def progress_callback(percentage, current_file, current, total):
                print(f"🔄 图片扫描进度: {percentage}% - {current_file} ({current}/{total})")
            print("📝 使用打印版本的进度回调")
        

        
        # 简化进度更新函数调用
        def update_progress(percentage, message, current=0, total=0):
            try:
                progress_callback(percentage, message, current, total)
            except Exception as e:
                print(f"进度更新失败: {e}")
        
        # 🎯 简单直接的图片扫描函数 - 每个包含图片的文件夹 = 一个图集
        def scan_image_folders(scan_path):
            """
            简单直接的扫描方式：
            - 遍历所有文件夹（包括多级嵌套）
            - 如果文件夹内有图片文件，就将该文件夹作为一个图集
            - 文件夹名 = 图集名，文件夹内的图片 = 图集内容
            
            返回: {collection_name: [image_files]}
            """
            collections = {}
            
            # 递归遍历所有目录
            for current_dir in scan_path.rglob('*'):
                if not current_dir.is_dir():
                    continue
                    
                # 查找当前目录下的图片文件（不递归，只看直接子文件）
                image_files = []
                for file_path in current_dir.iterdir():
                    if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_IMAGE_FORMATS:
                        image_files.append(file_path)
                
                # 如果当前目录有图片，就创建一个图集
                if image_files:
                    collection_name = current_dir.name
                    
                    # 处理重名情况：如果已存在同名图集，添加路径信息区分
                    if collection_name in collections:
                        # 使用相对路径作为唯一标识
                        try:
                            rel_path = current_dir.relative_to(scan_path)
                            collection_name = str(rel_path).replace('\\', '_').replace('/', '_')
                        except ValueError:
                            collection_name = f"{current_dir.name}_{len(collections)}"
                    
                    collections[collection_name] = image_files
                    print(f"📂 发现图集: {collection_name} ({len(image_files)} 张图片)")
            
            # 特殊处理：如果根目录直接有图片
            root_images = []
            for file_path in scan_path.iterdir():
                if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_IMAGE_FORMATS:
                    root_images.append(file_path)
            
            if root_images:
                collection_name = scan_path.name
                # 如果已有同名图集，添加后缀区分
                if collection_name in collections:
                    collection_name = f"{scan_path.name}_根目录"
                collections[collection_name] = root_images
                print(f"📂 发现根目录图集: {collection_name} ({len(root_images)} 张图片)")
            
            print(f"🔍 总共发现 {len(collections)} 个图集")
            
            # 🎯 调试输出：显示扫描结果的详细信息
            if collections:
                print("📋 扫描结果详情:")
                for name, files in collections.items():
                    print(f"  📂 图集: {name}")
                    for i, file_path in enumerate(files[:3]):  # 只显示前3个文件
                        print(f"    📄 {file_path.name}")
                    if len(files) > 3:
                        print(f"    ... 还有 {len(files) - 3} 个文件")
            
            return collections
        
        try:
            # ================== 参数校验 ==================
            path = Path(root_path).resolve()
            if not path.exists():
                update_progress(0, '目录不存在', 0, 0)
                return {'status': 'error', 'message': f'目录不存在: {root_path}'}
            if not path.is_dir():
                update_progress(0, '需要目录路径', 0, 0)
                return {'status': 'error', 'message': '需要目录路径'}
            print(f"解析后绝对路径：{path}")

            # ================== 跨平台路径处理 ==================
            if os.name == 'nt':  # Windows系统
                if not path.drive:
                    update_progress(0, '需要包含盘符的绝对路径', 0, 0)
                    return {'status': 'error', 'message': f'目录不存在: {root_path}'}
                disk_drive = path.drive[0]
                mount_path = Path(f"{disk_drive}:\\").resolve()
            else:  # Linux/Mac
                disk_drive = 'root'
                mount_path = Path('/').resolve()

            try:
                relative_to_mount = path.relative_to(mount_path)
            except ValueError:
                error_msg = f'路径必须在{mount_path}目录下'
                update_progress(0, error_msg, 0, 0)
                return {'status': 'error', 'message': error_msg}

            storage_root = relative_to_mount.as_posix()+"/"
            print(f"计算存储根路径：{storage_root}")

            # ================== 🎯 扫描图片文件夹 ==================
            update_progress(1, '正在扫描图片文件夹...', 0, 0)
            
            # 使用简单直接的扫描方式：每个包含图片的文件夹 = 一个图集
            image_collections = scan_image_folders(path)
            
            if not image_collections:
                return {'status': 'error', 'message': '未发现任何图片文件'}
            
            # 计算总文件数
            total_files_count = sum(len(files) for files in image_collections.values())
            total_collections = len(image_collections)
            
            print(f"📊 扫描结果: {total_collections} 个集合，{total_files_count} 张图片")
            update_progress(5, f'发现 {total_collections} 个图片集合，{total_files_count} 张图片', total_collections, total_collections)

            # ================== 数据库事务 ==================
            with self.connect() as db:
                cursor = db.cursor()
                db.begin()

                try:
                    update_progress(6, '初始化数据库...', 0, total_files_count)
                    
                    #磁盘信息处理
                    cursor.execute("""
                        INSERT INTO storage_disk 
                            (disk_drive, mount_path, is_active)
                        VALUES (%s, %s, 1)
                        ON DUPLICATE KEY UPDATE 
                            is_active = VALUES(is_active)  -- 只更新必要字段
                        """, (disk_drive, mount_path.as_posix()))

                    # 获取磁盘ID
                    cursor.execute("""
                        SELECT disk_id FROM storage_disk 
                        WHERE disk_drive = %s AND mount_path = %s
                        """, (disk_drive, mount_path.as_posix()))
                    disk_row = cursor.fetchone()
                    disk_id = disk_row[0] if disk_row else None
                    if not disk_id:
                        raise ValueError("无法获取磁盘ID")

                    # ================== 🎯 处理图片集合 ==================
                    total_files = 0
                    processed_files = 0
                    
                    collection_names = list(image_collections.keys())
                    
                    for i, collection_name in enumerate(collection_names):
                        image_files = image_collections[collection_name]
                        
                        # 🎯 集合级进度更新（8%-95%，给文件处理留出87%的空间）
                        collection_start_progress = 8 + (i / len(collection_names)) * 87
                        
                        update_progress(
                            int(collection_start_progress), 
                            f'处理图片集合: {collection_name}', 
                            i + 1, 
                            len(collection_names)
                        )
                        
                        print(f"\n📂 处理图片集合：{collection_name} ({len(image_files)} 张图片)")

                        cursor.execute("SAVEPOINT sp_collection")
                        try:
                            # 插入图片集合信息
                            cursor.execute("""
                                INSERT INTO image_collection 
                                    (disk_id, collection_name, storage_root, group_id)
                                VALUES (%s, %s, %s, %s)
                                ON DUPLICATE KEY UPDATE 
                                    collection_id = LAST_INSERT_ID(collection_id)
                                """, (disk_id, collection_name, storage_root, 2 if is_vip else 1))

                            collection_id = cursor.lastrowid
                            print(f"📋 集合ID：{collection_id}")

                            # ================== 🎯 处理图片文件（仅处理图片格式） ==================
                            file_count = 0
                            for file_path in image_files:
                                try:
                                    # 再次确认是图片格式（双重保险）
                                    if file_path.suffix.lower() not in SUPPORTED_IMAGE_FORMATS:
                                        continue
                                    
                                    relative_path = file_path.relative_to(path).as_posix()
                                    file_size = file_path.stat().st_size

                                    cursor.execute("""
                                        INSERT IGNORE INTO image_item 
                                            (collection_id, relative_path, file_size)
                                        VALUES (%s, %s, %s)
                                        """, (collection_id, relative_path, file_size))

                                    if cursor.rowcount == 1:
                                        file_count += 1
                                        total_files += 1
                                        processed_files += 1
                                        
                                        # 🎯 更新文件级别的进度（平滑过渡，减少跳跃感）
                                        if processed_files % 50 == 0 or processed_files <= 100 or processed_files == total_files_count:  
                                            # 前100个文件每个都更新，后续每50个文件更新一次，最后一个文件也更新
                                            file_progress = 8 + (processed_files / total_files_count) * 87  # 8%-95%
                                            print(f"🔄 进度更新: {int(file_progress)}% - {file_path.name} ({processed_files}/{total_files_count})")
                                            update_progress(
                                                int(file_progress), 
                                                f'处理图片: {file_path.name} ({processed_files}/{total_files_count})', 
                                                processed_files, 
                                                total_files_count
                                            )
                                        
                                except Exception as e:
                                    print(f"❌ 图片处理失败：{file_path} | 错误：{str(e)}")
                                    continue

                            print(f"✅ 成功插入 {file_count} 张图片")

                        except Exception as e:
                            print(f"❌ 图片集合处理失败：{collection_name} | 回滚操作")
                            cursor.execute("ROLLBACK TO SAVEPOINT sp_collection")
                            continue

                    # ================== 完成处理 ==================
                    update_progress(96, '提交数据库事务...', processed_files, total_files_count)
                    db.commit()
                    
                    update_progress(100, '扫描完成', processed_files, total_files_count)
                    
                    res={
                        'status': 'success',
                        'message': f'共处理{total_files}个文件',
                        'storage_root': f"{mount_path.as_posix()}/{storage_root}"
                    }
                    print(res)
                    return res

                except Exception as e:
                    db.rollback()
                    update_progress(0, f'数据库操作失败: {str(e)}', 0, 0)
                    return {'status': 'error', 'message': f'数据库操作失败: {str(e)}'}
                finally:
                    cursor.close()

        except Exception as e:
            update_progress(0, f'系统错误: {str(e)}', 0, 0)
            return {'status': 'error', 'message': f'系统错误: {str(e)}'}


if __name__ == '__main__':
    db = Connect_mysql.connect()





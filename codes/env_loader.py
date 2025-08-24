import os
from pathlib import Path
import dotenv

def load_env():
    """加载.env文件中的环境变量"""
    # 查找.env文件位置
    current_dir = Path(__file__).parent
    env_path = current_dir / '.env'
    
    if env_path.exists():
        # 加载.env文件
        dotenv.load_dotenv(env_path)
        print(f"✅ 成功加载.env文件: {env_path}")
    else:
        print(f"⚠️ 未找到.env文件: {env_path}")
    
    return {
        'mysql_host': os.getenv('mysql_host', 'localhost'),
        'mysql_port': int(os.getenv('mysql_port', '3306')),
        'mysql_user': os.getenv('mysql_user', 'root'),
        'mysql_password': os.getenv('mysql_password', '123456'),
        'mysql_database': os.getenv('mysql_database', 'fishmo'),
        'mysql_charset': os.getenv('mysql_charset', 'utf8'),
        'ffmpeg_path': os.getenv('ffmpeg_path', ''),
        'video_everyPageShowVideoNum': int(os.getenv('video_everyPageShowVideoNum', '30')),
        'image_everyPageShowImageNum': int(os.getenv('image_everyPageShowImageNum', '21')),
        'showImage_everyPageShowImageNum': int(os.getenv('showImage_everyPageShowImageNum', '30')),
        'audio_everyPageShowAudioNum': int(os.getenv('audio_everyPageShowAudioNum', '50')),
        'app_host': os.getenv('app_host', '0.0.0.0'),
        'app_port': int(os.getenv('app_port', '5000'))
    }

# 加载环境变量
env_config = load_env()

# 提供便捷访问
mysql_host = env_config['mysql_host']
mysql_port = env_config['mysql_port']
mysql_user = env_config['mysql_user']
mysql_password = env_config['mysql_password']
mysql_database = env_config['mysql_database']
mysql_charset = env_config['mysql_charset']
ffmpeg_path = env_config['ffmpeg_path']
video_everyPageShowVideoNum = env_config['video_everyPageShowVideoNum']
image_everyPageShowImageNum = env_config['image_everyPageShowImageNum']
showImage_everyPageShowImageNum = env_config['showImage_everyPageShowImageNum']
audio_everyPageShowAudioNum = env_config['audio_everyPageShowAudioNum']
app_host = env_config['app_host']
app_port = env_config['app_port']

# 创建数据库配置字典
db_config = {
    'host': mysql_host,
    'port': mysql_port,
    'user': mysql_user,
    'password': mysql_password,
    'database': mysql_database,
    'charset': mysql_charset
}
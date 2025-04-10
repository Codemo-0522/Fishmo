import os

# @数据库连接参数=====================================================================
mysql_host="localhost"           #数据库服务器地址
mysql_port=3306                  #数据库服务器端口号
mysql_user="root"                #数据库用户名
mysql_password="123456"          #数据库密码
mysql_database="fishmo"     #数据库名称
mysql_charset="utf8"             #数据库字符集

# --------------- 路径配置（Linux 环境）----------------
# 外部视频存储路径
VIDEO_BASE = os.path.normpath("/root/python-test/resource")

# 外部缩略图存储路径
THUMBNAIL_BASE = os.path.normpath("/root/python-test/video_images")

# FFmpeg路径（Linux默认安装路径）
FFMPEG_PATH = "/usr/bin/ffmpeg"  # 需确保已安装ffmpeg

# --------------- 可选：跨平台兼容性处理 ----------------
if os.name == 'nt':  # 如果是Windows系统，覆盖路径
    VIDEO_BASE = os.path.normpath(r"E:\media\Video_player_resource")
    THUMBNAIL_BASE = os.path.normpath(r"E:\temps\video_images")
    FFMPEG_PATH = r"D:\Application\ffmpeg\ffmpeg-2025-03-20-git-76f09ab647-full_build\bin\ffmpeg.exe"
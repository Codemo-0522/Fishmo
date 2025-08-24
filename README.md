# Fishmo-v1 🐟

一个基于Flask的多媒体文件管理系统，支持视频、音频、图片的在线上传和浏览

## ✨ 功能特性

- 🎬 **视频管理**: 支持多种视频格式，自动生成缩略图，在线播放
- 🎵 **音频管理**: 支持音频文件播放
- 🖼️ **图片管理**: 图片浏览，图集展示
- 🔍 **智能搜索**: 支持文件名、标签搜索
- 👥 **用户权限**: 普通用户和管理员用户权限管理（数据库内置了3个用户，密码是`123456`）
  - 普通用户：`user`
  - 高级用户：`vip_user`
  - 管理员账号：`admin`


## 📋 系统要求
- **Python**: 3.8 或更高版本
- **MySQL**: 8.0 或更高版本
- **FFmpeg**: 用于视频处理

## 🚀 快速部署

### 1. 环境准备

#### 安装Python
(1) 访问 [Python官网](https://www.python.org/downloads/windows/) 下载Python 3.8+

#### 安装MySQL
(2) 下载 [MySQL Installer](https://dev.mysql.com/downloads/installer/)

#### 安装FFmpeg
(3) 访问 [FFmpeg官网](https://ffmpeg.org/download.html#build-windows)


### 2. 项目部署

#### 下载项目
```bash
# 下载项目到本地
git clone https://github.com/Codemo-0522/Fishmo.git
cd Fishmo
```

#### 创建虚拟环境
```bash
# 创建虚拟环境（需要cd进入本项目主目录内）
python -m venv venv

# 激活虚拟环境
venv\Scripts\activate
```

#### 安装依赖
```bash
pip install -r requirements.txt
```
如果以上命令安装太慢了可以使用如下命令(推荐)
```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

#### 配置数据库
1. 进入MySQL命令行并登录
```bash
mysql -u root -p
```
  
2. 执行以下SQL命令：
```bash
CREATE DATABASE fishmo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. 初始化数据库表（需要退出mysql命令行后，使用`cmd`进入`database_init.sql`所在的文件夹内，粘贴命令运行并输入密码点击回车如果没有任何输出说明成功了）：
```bash
mysql -u root -p fishmo < database_init.sql
```

#### 配置环境变量
1. 打开 `codes` 目录下的 `.env` 文件并根据自己的实际情况修改数据库参数和ffmpeg路径


### 3. 启动应用

#### 启动服务
```bash
# 确保虚拟环境已激活
venv\Scripts\activate

# 启动应用
python main.py
```

#### 访问应用
打开浏览器访问：`http://localhost:1015`（默认端口是`1015`，如果你删了.env的端口那么默认是`5000`，或者是`你自己设置的端口`）

## 📁 项目结构

```
Fishmo/
├── main.py                  # 主程序入口
├── requirements.txt         # Python依赖包
├── database_init.sql        # 数据库初始化脚本
├── codes/                   # 核心代码
│   ├── env_loader.py        # 环境配置读取
│   ├── connect_mysql.py     # 数据库连接
│   ├── video_queries_new.py # 视频查询
│   ├── video_scan_new.py    # 视频扫描
│   ├── audio_processor.py   # 音频处理
│   └── function.py          # 通用功能
├── templates/               # 网页模板
├── static/                  # 静态资源
```

## 🔍 使用说明

### 管理员功能
1. 访问管理页面：`http://localhost:1015/admin`（需要登录管理员账号，账号： `admin`，密码`123456`）
2. 管理员可以`扫描媒体资源上传数据库`或者`清空数据库`

### 用户功能
1. 浏览视频、音频、图片
2. 搜索文件
3. 在线播放/查看
4. 按分类浏览


### Web app截图
<img width="2556" height="1420" alt="image" src="https://github.com/user-attachments/assets/44fb7fb7-0df7-4015-b87e-8965f61bcdf0" />
<img width="2558" height="1427" alt="image" src="https://github.com/user-attachments/assets/0d363a11-8683-4076-b1a1-1e2bcf12ed5c" />
<img width="2557" height="969" alt="image" src="https://github.com/user-attachments/assets/bd0f4123-12ef-48ea-a146-84e902826550" />


**注意**: 本项目写着玩的，很多BUG，代码很烂但是基本能跑，页面组件如果点击没反应就说明对应方法没实现


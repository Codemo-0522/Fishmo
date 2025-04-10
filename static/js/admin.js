document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const saveBtn = document.querySelector('.save-btn');
    const scanBtn = document.querySelector('.scan-btn');
    const scanThumbBtn = document.querySelector('.scan-thumb-btn');
    const videoBaseInput = document.getElementById('videoBase');
    const thumbnailBaseInput = document.getElementById('thumbnailBase');
    const scanDirInput = document.getElementById('scanDir');
    const scanProgress = document.getElementById('scanProgress');
    const sidebar = document.getElementById('sidebar');

    // 从localStorage获取侧边栏状态
    const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isSidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }

    // 页面加载时获取当前配置
    fetch('/api/get-config')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                videoBaseInput.value = data.data.video_base || '';
                thumbnailBaseInput.value = data.data.thumbnail_base || '';
                // 默认将扫描目录设置为视频根路径
                scanDirInput.value = data.data.video_base || '';
            }
        })
        .catch(error => {
            showError('获取配置失败：' + error.message);
        });

    // 保存配置按钮点击事件
    saveBtn.addEventListener('click', function() {
        // 获取输入值
        const videoBase = videoBaseInput.value.trim();
        const thumbnailBase = thumbnailBaseInput.value.trim();

        // 输入验证
        if (!videoBase) {
            showError('请输入视频根路径');
            videoBaseInput.focus();
            return;
        }

        if (!thumbnailBase) {
            showError('请输入缩略图根路径');
            thumbnailBaseInput.focus();
            return;
        }

        // 禁用保存按钮，防止重复提交
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';

        // 发送保存请求
        fetch('/api/save-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoBase: videoBase,
                thumbnailBase: thumbnailBase
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                showSuccess('配置保存成功！');
            } else {
                showError('保存失败：' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            showError('保存失败：' + error.message);
        })
        .finally(() => {
            // 恢复保存按钮状态
            saveBtn.disabled = false;
            saveBtn.textContent = '保存配置';
        });
    });

    // 扫描视频按钮点击事件
    scanBtn.addEventListener('click', function() {
        handleScan('video');
    });

    // 生成缩略图按钮点击事件
    scanThumbBtn.addEventListener('click', generateAllThumbnails);

    // 处理扫描操作
    function handleScan(type) {
        const parentDir = scanDirInput.value.trim();
        const btn = type === 'video' ? scanBtn : scanThumbBtn;
        const actionText = type === 'video' ? '视频' : '缩略图';

        // 验证输入
        if (!parentDir) {
            showError('请输入要扫描的目录路径');
            scanDirInput.focus();
            return;
        }

        // 禁用按钮并显示进度
        btn.disabled = true;
        btn.textContent = '扫描中...';
        scanProgress.textContent = `正在扫描${actionText}，请稍候...`;

        // 显示并重置进度条
        progressController.reset();
        progressController.show();

        // 创建用于取消请求的 signal
        const signal = progressController.createAbortController();

        // 创建 EventSource 获取实时进度
        const eventSource = new EventSource(`/api/scan-${type}s-progress`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            progressController.updateProgress(
                data.percentage,
                `正在扫描: ${data.current_file || ''}`
            );
        };

        // 发送扫描请求
        fetch(`/api/scan-${type}s`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parentDir: parentDir
            }),
            signal
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                progressController.updateProgress(100, '扫描完成！');
                scanProgress.innerHTML = `
                    扫描完成！<br>
                    新增分类：${data.categories_added || 0}<br>
                    成功数：${data.videos_added || 0}<br>
                    失败数：${data.failed_count || 0}
                `;
                showSuccess(`${actionText}扫描完成！`);
            }
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                scanProgress.textContent = '扫描已取消';
                showError('扫描已取消');
            } else {
                scanProgress.textContent = `扫描失败：${error.message}`;
                showError(`${actionText}扫描失败：${error.message}`);
            }
        })
        .finally(() => {
            progressController.hide();
            btn.disabled = false;
            btn.textContent = `扫描${actionText}`;
        });
    }
});

// 切换侧边栏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    
    // 保存状态到localStorage
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

// 切换内容区域
function switchSection(sectionId) {
    // 更新导航项状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeNav = document.querySelector(`.nav-item[onclick*="${sectionId}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // 更新内容区域显示
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
    });
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // 在移动端自动收起侧边栏
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('show');
    }
}

// 显示成功消息
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    showToast(toast);
}

// 显示错误消息
function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    showToast(toast);
}

// 显示提示消息
function showToast(toast) {
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }, 100);
}

// 处理移动端侧边栏显示
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        
        // 添加遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        // 点击遮罩层关闭侧边栏
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('show');
            overlay.style.display = 'none';
        });

        // 添加移动端菜单按钮
        const menuBtn = document.createElement('button');
        menuBtn.className = 'mobile-menu-btn';
        menuBtn.innerHTML = '☰';
        document.body.appendChild(menuBtn);

        // 点击菜单按钮显示侧边栏
        menuBtn.addEventListener('click', () => {
            sidebar.classList.add('show');
            overlay.style.display = 'block';
        });
    }
});

// 处理退出登录
async function handleLogout() {
    try {
        const response = await fetch('/logout');
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/';  // 重定向到首页
        } else {
            showError('退出失败：未知错误');
        }
    } catch (error) {
        showError('退出失败：' + error.message);
    }
}

// 进度条控制器
class ProgressController {
    constructor() {
        this.container = document.querySelector('.progress-container');
        this.progressBar = this.container.querySelector('.progress-bar-inner');
        this.progressText = this.container.querySelector('.progress-text');
        this.progressPercentage = this.container.querySelector('.progress-percentage');
        this.abortController = null;
    }

    show() {
        this.container.classList.add('active');
        this.progressBar.classList.add('active');
    }

    hide() {
        this.container.classList.remove('active');
        this.progressBar.classList.remove('active');
    }

    reset() {
        this.updateProgress(0, '准备就绪');
    }

    updateProgress(percentage, text) {
        this.progressBar.style.width = `${percentage}%`;
        this.progressPercentage.textContent = `${percentage}%`;
        if (text) {
            this.progressText.textContent = text;
        }
    }

    createAbortController() {
        this.abortController = new AbortController();
        return this.abortController.signal;
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// 创建进度条控制器实例
const progressController = new ProgressController();

// 修改生成缩略图函数
async function generateAllThumbnails() {
    const progressArea = document.getElementById('scanProgress');
    const generateBtn = document.querySelector('.scan-thumb-btn');
    
    try {
        generateBtn.disabled = true;
        generateBtn.textContent = '正在生成缩略图...';
        progressArea.textContent = '开始生成缩略图...\n';
        
        // 显示并重置进度条
        progressController.reset();
        progressController.show();

        // 创建 EventSource 获取实时进度
        const eventSource = new EventSource('/api/generate-thumbnails-progress');
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            progressController.updateProgress(
                data.percentage,
                `正在处理: ${data.current_file || ''}`
            );
        };

        const response = await fetch('/api/generate-all-thumbnails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        eventSource.close();

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('服务器返回了非JSON格式的数据');
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            progressController.updateProgress(100, '生成完成！');
            const result = data.data;
            let message = `缩略图生成完成！\n`;
            message += `总计视频数：${result.total}\n`;
            message += `成功生成：${result.success_count}\n`;
            message += `失败数量：${result.failed_count}\n`;
            
            if (result.failed_videos && result.failed_videos.length > 0) {
                message += '\n失败的视频：\n';
                result.failed_videos.forEach(video => {
                    message += `- ${video}\n`;
                });
            }
            
            progressArea.textContent = message;
            showSuccess('缩略图生成完成');
        } else {
            throw new Error(data.message || '生成缩略图失败');
        }
    } catch (error) {
        console.error('生成缩略图错误:', error);
        progressArea.textContent = `发生错误：${error.message}`;
        showError('生成缩略图时发生错误：' + error.message);
    } finally {
        progressController.hide();
        generateBtn.disabled = false;
        generateBtn.textContent = '生成所有缩略图';
    }
}

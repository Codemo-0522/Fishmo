document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const saveBtn = document.querySelector('.save-btn');
    const scanBtn = document.querySelector('.scan-btn');
    const videoBaseInput = document.getElementById('videoBase');
    const thumbnailBaseInput = document.getElementById('thumbnailBase');
    const scanDirInput = document.getElementById('scanDir');
    
    // 初始化现代化选择框
    initializeModernSelects();
    
    // 新的扫描元素
    const videoScanDirInput = document.getElementById('videoScanDir');
    const thumbnailDirInput = document.getElementById('thumbnailDir');
    
    const scanProgress = document.getElementById('scanProgress');
    const sidebar = document.getElementById('sidebar');

    // 从localStorage获取侧边栏状态
    const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isSidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }

    // 扫描视频按钮点击事件
    scanBtn.addEventListener('click', function() {
        handleScan('video');
    });



    // 处理扫描操作
    function handleScan(type) {
        const parentDir = scanDirInput.value.trim();
        const btn = scanBtn;
        const actionText = '视频';

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

        // 创建一个正在处理的标志
        let isProcessing = false;
        // 最后接收到的进度值
        let lastProgressData = null;

        // 创建 EventSource 获取实时进度
        const eventSource = new EventSource(`/api/scan-${type}s-progress`);
        
        eventSource.onmessage = (event) => {
            // 如果正在处理上一条消息，则将当前消息保存起来，稍后处理
            if (isProcessing) {
                lastProgressData = JSON.parse(event.data);
                return;
            }
            
            isProcessing = true;
            const data = JSON.parse(event.data);
            
            // 使用requestAnimationFrame确保进度条平滑过渡
            requestAnimationFrame(() => {
                progressController.updateProgress(
                    data.percentage,
                    `正在扫描: ${data.current_file || ''}`
                );
                
                // 延迟一小段时间后才处理下一个进度更新，避免频繁重绘
                setTimeout(() => {
                    isProcessing = false;
                    
                    // 如果在处理期间有新的进度数据，则继续处理
                    if (lastProgressData) {
                        const tempData = lastProgressData;
                        lastProgressData = null;
                        
                        requestAnimationFrame(() => {
                            progressController.updateProgress(
                                tempData.percentage,
                                `正在扫描: ${tempData.current_file || ''}`
                            );
                            
                            // 递归处理，确保所有进度更新都被应用
                            setTimeout(() => {
                                isProcessing = false;
                            }, 50);
                        });
                    }
                }, 50);
            });
        };

        // 获取VIP设置（仅对视频扫描有效）
        let requestBody = { parentDir: parentDir };
        if (type === 'video') {
            const isVip = document.getElementById('video-isVip').value === 'true';
            requestBody.is_vip = isVip;
        }

        // 发送扫描请求
        fetch(`/api/scan-${type}s`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal
        })
        .then(response => response.json())
        .then(data => {
            // 关闭事件流
            eventSource.close();
            
            if (data.status === 'success') {
                // 使用setTimeout确保最终进度显示是100%
                setTimeout(() => {
                    progressController.updateProgress(100, '扫描完成！');
                }, 300);
                
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
            // 关闭事件流
            eventSource.close();
            
            if (error.name === 'AbortError') {
                scanProgress.textContent = '扫描已取消';
                showError('扫描已取消');
            } else {
                scanProgress.textContent = `扫描失败：${error.message}`;
                showError(`${actionText}扫描失败：${error.message}`);
            }
        })
        .finally(() => {
            // 延迟隐藏进度条，确保用户能看到最终状态
            setTimeout(() => {
                progressController.hide();
                btn.disabled = false;
                btn.textContent = `扫描${actionText}`;
            }, 500);
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

// 创建图片扫描专用的进度条控制器
class ImageProgressController {
    constructor() {
        this.container = document.querySelector('#image-section .progress-container');
        if (this.container) {
            this.progressBar = this.container.querySelector('.progress-bar-inner');
            this.progressText = this.container.querySelector('.progress-text');
            this.progressPercentage = this.container.querySelector('.progress-percentage');
        }
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
}

// 创建图片扫描专用进度控制器实例
const imageProgressController = new ImageProgressController();


function clear_video_table() {
    // 🎯 添加确认对话框，防止误删
    if (!confirm('确定要清空所有视频数据吗？此操作不可恢复！')) {
        return;
    }
    
    fetch('/clear_video_table')
      .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('网络响应异常');
        })
      .then(data => {
            // 🎯 使用提示标签而不是alert弹窗
            showSuccess(data.message);
        })
      .catch(error => {
            console.error('错误:', error);
            showError('发生错误，请稍后重试');
        });
}

function image_upload() {
    // 获取输入框的值
    const imageBase = document.getElementById('imageBase').value.trim();
    const isVip = document.getElementById('image-isVip').value === 'true';

    // 检查图片根路径是否为空
    if (!imageBase) {
        showError('图片根路径不能为空');
        return;
    }

    // 显示并重置进度条（使用图片专用进度控制器）
    imageProgressController.reset();
    imageProgressController.show();

    // 进度监控变量（完全模仿视频扫描）
    let isProcessing = false;
    let lastProgressData = null;

    // 创建 EventSource 获取实时进度（完全模仿视频扫描）
    const eventSource = new EventSource('/api/scan-images-progress');
    
    eventSource.onmessage = (event) => {
        // 如果正在处理上一条消息，则将当前消息保存起来，稍后处理
        if (isProcessing) {
            lastProgressData = JSON.parse(event.data);
        return;
    }

        isProcessing = true;
        const data = JSON.parse(event.data);
        
        // 使用requestAnimationFrame确保进度条平滑过渡（使用图片专用进度控制器）
        requestAnimationFrame(() => {
            imageProgressController.updateProgress(
                data.percentage,
                `正在扫描: ${data.current_file || ''}`
            );
            
            // 延迟一小段时间后才处理下一个进度更新，避免频繁重绘
            setTimeout(() => {
                isProcessing = false;
                
                // 如果在处理期间有新的进度数据，则继续处理
                if (lastProgressData) {
                    const tempData = lastProgressData;
                    lastProgressData = null;
                    
                    requestAnimationFrame(() => {
                        imageProgressController.updateProgress(
                            tempData.percentage,
                            `正在扫描: ${tempData.current_file || ''}`
                        );
                        
                        // 递归处理，确保所有进度更新都被应用
                        setTimeout(() => {
                            isProcessing = false;
                        }, 50);
                    });
                }
            }, 50);
        });
    };

    // 构建请求体（使用与视频扫描一致的参数名）
    const requestBody = {
        parentDir: imageBase,  // 使用 parentDir 而不是 root_path
        is_vip: isVip
    };

    // 发送扫描请求（完全模仿视频扫描）
    fetch('/api/scan-images', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
   .then(data => {
        // 关闭事件流（完全模仿视频扫描）
        eventSource.close();
        
        if (data.status === 'success') {
            // 使用setTimeout确保最终进度显示是100%（使用图片专用进度控制器）
            setTimeout(() => {
                imageProgressController.updateProgress(100, '扫描完成！');
            }, 300);
            
            // 显示扫描结果（模仿视频扫描格式）
            const scanProgress = document.getElementById('imgScanProgress');
            if (scanProgress) {
                scanProgress.innerHTML = `
                    扫描完成！<br>
                    新增分类：${data.categories_added || 0}<br>
                    成功数：${data.images_added || 0}<br>
                    失败数：${data.failed_count || 0}
                `;
            }
            showSuccess('图片扫描完成！');
        } else {
            showError(`图片扫描失败：${data.message}`);
        }
    })
   .catch(error => {
        // 关闭事件流
        eventSource.close();
        
        showError(`图片扫描失败：${error.message}`);
    })
    .finally(() => {
        // 延迟隐藏进度条，确保用户能看到最终状态（使用图片专用进度控制器）
        setTimeout(() => {
            imageProgressController.hide();
        }, 500);
    });
}

// 图片扫描进度管理函数
function showImageProgress(message) {
    const imgScanProgress = document.getElementById('imgScanProgress');
    const progressContainer = document.querySelector('#image-section .progress-container');
    
    if (progressContainer) {
        progressContainer.style.display = 'block';
    }
    
    if (imgScanProgress) {
        imgScanProgress.innerHTML = `<div class="scanning-message">${message}</div>`;
    }
}

function updateImageProgress(percentage, text) {
    const progressContainer = document.querySelector('#image-section .progress-container');
    if (progressContainer) {
        const progressText = progressContainer.querySelector('.progress-text');
        const progressPercentage = progressContainer.querySelector('.progress-percentage');
        const progressBarInner = progressContainer.querySelector('.progress-bar-inner');
        
        if (progressText) progressText.textContent = text;
        if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
        if (progressBarInner) progressBarInner.style.width = `${percentage}%`;
    }
}

function showImageResult(type, message) {
    const imgScanProgress = document.getElementById('imgScanProgress');
    if (imgScanProgress) {
        const className = type === 'success' ? 'success-message' : 'error-message';
        imgScanProgress.innerHTML = `
            <div class="${className}">
                <h4>${type === 'success' ? '扫描完成' : '扫描失败'}</h4>
                <p>${message}</p>
            </div>
        `;
    }
}
//========================================================
// 处理移动端侧边栏交互
document.addEventListener('DOMContentLoaded', function() {
    const mobileNavToggle = document.getElementById('mobileNavToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    // 移动端菜单按钮点击事件
    mobileNavToggle.addEventListener('click', function() {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');

        // 修改按钮图标
        const icon = this.querySelector('i');
        if (sidebar.classList.contains('mobile-open')) {
            icon.className = 'fas fa-times';
        } else {
            icon.className = 'fas fa-angle-right';
        }
    });

    // 点击遮罩层关闭侧边栏
    overlay.addEventListener('click', function() {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        mobileNavToggle.querySelector('i').className = 'fas fa-angle-right';
    });

    // 点击导航项后在移动端自动关闭侧边栏
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                mobileNavToggle.querySelector('i').className = 'fas fa-bars';
            }
        });
    });
});

// 🎯 扫描音频文件（使用SSE实时更新，模仿视频扫描）
function scanAudio() {
    const rootPath = document.getElementById('audioBase').value.trim();
    const isVip = document.getElementById('audio-isVip').value === 'true';
    
    if (!rootPath) {
        showError('请输入音频根路径');
        return;
    }
    
    // 重置音频专用进度条和显示
    resetAudioProgress();
    updateAudioProgressText('开始扫描音频文件...');
    
    // 🎯 进度监控变量（完全模仿视频扫描）
    let isProcessing = false;
    let lastProgressData = null;
    
    // 🎯 创建 EventSource 获取实时进度
    const eventSource = new EventSource('/api/scan-audio-progress');
    
    eventSource.onmessage = (event) => {
        // 如果正在处理上一条消息，则将当前消息保存起来，稍后处理
        if (isProcessing) {
            lastProgressData = JSON.parse(event.data);
            return;
        }
        
        isProcessing = true;
        const data = JSON.parse(event.data);
        
        // 使用requestAnimationFrame确保进度条平滑过渡
        requestAnimationFrame(() => {
            updateAudioProgress(data.percentage);
            updateAudioProgressText(`正在扫描: ${data.current_file || ''}`);
            
            // 延迟一小段时间后才处理下一个进度更新，避免频繁重绘
            setTimeout(() => {
                isProcessing = false;
                
                // 如果在处理期间有新的进度数据，则继续处理
                if (lastProgressData) {
                    const tempData = lastProgressData;
                    lastProgressData = null;
                    
                    requestAnimationFrame(() => {
                        updateAudioProgress(tempData.percentage);
                        updateAudioProgressText(`正在扫描: ${tempData.current_file || ''}`);
                        
                        // 递归处理，确保所有进度更新都被应用
                        setTimeout(() => {
                            isProcessing = false;
                        }, 50);
                    });
                }
            }, 50);
        });
    };
    
    // 🎯 发送扫描请求（完全模仿视频扫描）
    fetch('/api/scan_audio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            root_path: rootPath,
            is_vip: isVip
        })
    })
    .then(response => response.json())
    .then(data => {
        // 关闭事件流（完全模仿视频扫描）
        eventSource.close();
        
        if (data.status === 'success') {
            // 使用setTimeout确保最终进度显示是100%
            setTimeout(() => {
                updateAudioProgress(100);
                updateAudioProgressText('扫描完成！');
            }, 300);
            
            // 更新扫描结果显示
            const scanProgress = document.getElementById('audioScanProgress');
            scanProgress.innerHTML = `
                <div class="success-message">
                    <h4>扫描完成</h4>
                    <p>${data.message}</p>
                    <p>处理时间：${data.processing_time}</p>
                </div>
            `;
            showSuccess(data.message);
        } else {
            throw new Error(data.message);
        }
    })
    .catch(error => {
        // 关闭事件流
        eventSource.close();
        
        updateAudioProgressText(`扫描失败：${error.message}`);
        updateAudioProgress(0);
        
        // 显示错误信息
        const scanProgress = document.getElementById('audioScanProgress');
        scanProgress.innerHTML = `
            <div class="error-message">
                <h4>扫描失败</h4>
                <p>${error.message}</p>
            </div>
        `;
        showError(error.message);
    });
}

// 清空图片数据表
function clearImageTable() {
    if (!confirm('确定要清空所有图片数据吗？此操作不可恢复！')) {
        return;
    }
    
    fetch('/clear_image_table', {
        method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showSuccess(data.message);
        } else {
            showError('清空图片表失败');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showError('清空图片表时发生错误');
    });
}

// 清空音频数据表
function clearAudioTable() {
    if (!confirm('确定要清空音频数据表吗？此操作不可恢复！')) {
        return;
    }
    
    fetch('/api/clear_audio_table')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 🎯 使用提示标签而不是alert弹窗
                showSuccess('音频数据表已清空');
            } else {
                throw new Error(data.message);
            }
        })
        .catch(error => {
            // 🎯 使用提示标签而不是alert弹窗
            showError(`清空失败：${error.message}`);
        });
}

// 批量处理音频
function processAudio() {
    const format = document.getElementById('audioFormat').value;
    const quality = document.getElementById('audioQuality').value;
    
    // 重置音频专用进度条和显示
    resetAudioProgress();
    updateAudioProgressText('开始处理音频文件...');
    
    fetch('/api/process_audio', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            format: format,
            quality: quality
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            updateAudioProgressText(`处理完成：${data.message}`);
            updateAudioProgress(100);
        } else {
            throw new Error(data.message);
        }
    })
    .catch(error => {
        updateAudioProgressText(`处理失败：${error.message}`);
        updateAudioProgress(0);
    });
}

// 重置进度条（通用）
function resetProgress() {
    const progressBar = document.querySelector('.progress-bar-inner');
    const progressText = document.querySelector('.progress-text');
    const progressPercentage = document.querySelector('.progress-percentage');
    
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '准备就绪';
    if (progressPercentage) progressPercentage.textContent = '0%';
}

// 更新进度文本（通用）
function updateProgressText(text) {
    const progressText = document.querySelector('.progress-text');
    if (progressText) progressText.textContent = text;
}

// 更新进度条（通用）
function updateProgress(percentage) {
    const progressBar = document.querySelector('.progress-bar-inner');
    const progressPercentage = document.querySelector('.progress-percentage');
    
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
}

// 音频专用进度条函数
function resetAudioProgress() {
    const audioSection = document.querySelector('#audio-section');
    if (audioSection) {
        const progressBar = audioSection.querySelector('.progress-bar-inner');
        const progressText = audioSection.querySelector('.progress-text');
        const progressPercentage = audioSection.querySelector('.progress-percentage');
        const progressContainer = audioSection.querySelector('.progress-container');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '准备就绪';
        if (progressPercentage) progressPercentage.textContent = '0%';
    }
}

function updateAudioProgressText(text) {
    const audioSection = document.querySelector('#audio-section');
    if (audioSection) {
        const progressText = audioSection.querySelector('.progress-text');
        if (progressText) progressText.textContent = text;
    }
}

function updateAudioProgress(percentage) {
    const audioSection = document.querySelector('#audio-section');
    if (audioSection) {
        const progressBar = audioSection.querySelector('.progress-bar-inner');
        const progressPercentage = audioSection.querySelector('.progress-percentage');
        
        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
    }
}

// 新的视频扫描函数（支持缩略图自动映射）
function scanVideosWithThumbnails() {
    // 获取输入值
    const videoScanDir = document.getElementById('videoScanDir').value.trim();
    const thumbnailDir = document.getElementById('thumbnailDir').value.trim();
    const isVip = document.getElementById('video-isVip').value === 'true';

    // 输入验证
    if (!videoScanDir) {
        showError('请输入视频扫描目录');
        document.getElementById('videoScanDir').focus();
        return;
    }

    if (!thumbnailDir) {
        showError('请输入缩略图存储目录');
        document.getElementById('thumbnailDir').focus();
        return;
    }

    const scanProgress = document.getElementById('scanProgress');

    // 🎯 显示并重置进度条（使用统一的进度控制器）
    progressController.reset();
    progressController.show();

    scanProgress.innerHTML = '<div class="loading">正在扫描视频并映射缩略图...</div>';

    // 🎯 创建一个正在处理的标志
    let isProcessing = false;
    let lastProgressData = null;

    // 🎯 创建 EventSource 获取实时进度
    const eventSource = new EventSource('/api/scan-videos-progress');
    
    eventSource.onmessage = (event) => {
        // 如果正在处理上一条消息，则将当前消息保存起来，稍后处理
        if (isProcessing) {
            lastProgressData = JSON.parse(event.data);
            return;
        }
        
        isProcessing = true;
        const data = JSON.parse(event.data);
        
        // 使用requestAnimationFrame确保进度条平滑过渡
        requestAnimationFrame(() => {
            progressController.updateProgress(
                data.percentage,
                `正在扫描: ${data.current_file || ''}`
            );
            
            // 延迟一小段时间后才处理下一个进度更新，避免频繁重绘
            setTimeout(() => {
                isProcessing = false;
                
                // 如果在处理期间有新的进度数据，则继续处理
                if (lastProgressData) {
                    const tempData = lastProgressData;
                    lastProgressData = null;
                    
                    requestAnimationFrame(() => {
                        progressController.updateProgress(
                            tempData.percentage,
                            `正在扫描: ${tempData.current_file || ''}`
                        );
                        
                        // 递归处理，确保所有进度更新都被应用
                        setTimeout(() => {
                            isProcessing = false;
                        }, 50);
                    });
                }
            }, 50);
        });
    };

    // 发送扫描请求
    fetch('/api/scan-videos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            parentDir: videoScanDir,
            thumbnailDir: thumbnailDir,
            is_vip: isVip
        })
    })
    .then(response => response.json())
    .then(data => {
        // 🎯 关闭事件流
        eventSource.close();
        
        if (data.status === 'success') {
            // 🎯 使用setTimeout确保最终进度显示是100%
            setTimeout(() => {
                progressController.updateProgress(100, '扫描完成！');
            }, 300);
            
            showSuccess('视频扫描完成！' + (data.message || ''));
            scanProgress.innerHTML = `
                <div class="success">
                    <h4>扫描结果</h4>
                    <p>添加分类：${data.categories_added || 0} 个</p>
                    <p>添加视频：${data.videos_added || 0} 个</p>
                    <p>失败数量：${data.failed_count || 0} 个</p>
                    ${data.disk_paths ? `<p>涉及磁盘：${data.disk_paths.join(', ')}</p>` : ''}
                </div>
            `;
        } else {
            showError('扫描失败：' + (data.message || data.error || '未知错误'));
            scanProgress.innerHTML = '<div class="error">扫描失败</div>';
        }
    })
    .catch(error => {
        // 🎯 关闭事件流
        eventSource.close();
        
        console.error('扫描请求失败:', error);
        showError('扫描请求失败：' + error.message);
        scanProgress.innerHTML = '<div class="error">网络请求失败</div>';
    })
    .finally(() => {
        // 🎯 延迟隐藏进度条，确保用户能看到最终状态
        setTimeout(() => {
            progressController.hide();
        }, 500);
    });
}

// 现代化选择框初始化函数
function initializeModernSelects() {
    const selectWrappers = document.querySelectorAll('.modern-select-wrapper');
    console.log('Found select wrappers:', selectWrappers.length);
    
    selectWrappers.forEach((wrapper, index) => {
        console.log(`Initializing select wrapper ${index + 1}`);
        const modernSelect = wrapper.querySelector('.modern-select');
        const selectElement = wrapper.querySelector('select');
        const selectDisplay = modernSelect.querySelector('.select-display');
        const selectText = modernSelect.querySelector('.select-text');
        const selectDropdown = modernSelect.querySelector('.select-dropdown');
        const options = selectDropdown.querySelectorAll('.select-option');
        
        // 点击显示/隐藏下拉框
        selectDisplay.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('Select display clicked');
            
            // 关闭其他打开的选择框
            document.querySelectorAll('.modern-select.active').forEach(activeSelect => {
                if (activeSelect !== modernSelect) {
                    activeSelect.classList.remove('active');
                }
            });
            
            // 切换当前选择框状态
            modernSelect.classList.toggle('active');
            console.log('Select active state:', modernSelect.classList.contains('active'));
        });
        
        // 选项点击事件
        options.forEach(option => {
            option.addEventListener('click', function(e) {
                e.stopPropagation();
                
                const value = this.getAttribute('data-value');
                const text = this.querySelector('span').textContent;
                
                // 更新显示文本
                selectText.textContent = text;
                
                // 更新隐藏的select元素
                selectElement.value = value;
                
                // 更新选项状态
                options.forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                
                // 关闭下拉框
                modernSelect.classList.remove('active');
                
                // 触发change事件
                const event = new Event('change', { bubbles: true });
                selectElement.dispatchEvent(event);
            });
        });
        
        // 点击外部关闭下拉框
        document.addEventListener('click', function(e) {
            if (!modernSelect.contains(e.target)) {
                modernSelect.classList.remove('active');
            }
        });
        
        // 键盘导航
        selectDisplay.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                modernSelect.classList.toggle('active');
            }
        });
        
        // 设置初始选中状态
        const currentValue = selectElement.value;
        const currentOption = selectDropdown.querySelector(`[data-value="${currentValue}"]`);
        if (currentOption) {
            currentOption.classList.add('selected');
            selectText.textContent = currentOption.querySelector('span').textContent;
        }
    });
}
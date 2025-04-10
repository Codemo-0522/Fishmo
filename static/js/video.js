// static/js/video.js
// global variables
let currentPage = 1;
let totalPages = 1;
let currentCategory = '';
let isSearchMode = false;

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', initVideoPage);

// 初始化视频页面
function initVideoPage() {
    // 添加搜索按钮事件监听器
    document.getElementById('searchButton').addEventListener('click', handleSearch);
    
    // 添加搜索框回车事件监听
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 添加滚动监听器，控制视频小窗播放
    window.addEventListener('scroll', handleVideoMinimize);
    
    // 加载视频分类
    loadCategories();
    
    // 加载视频列表（第一页）
    loadVideos(1);
    
    // 默认折叠分类栏
    setTimeout(() => {
        const categoryHeader = document.querySelector('.category-header');
        const categoriesList = document.querySelector('.categories-list');
        if (categoryHeader && categoriesList) {
            categoryHeader.classList.add('collapsed');
            categoriesList.classList.add('collapsed');
        }
    }, 100);
}

// 加载视频分类
function loadCategories() {
    fetch('/api/video-categories')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                displayCategories(data.data);
            } else {
                showError('加载分类失败：' + data.message);
            }
        })
        .catch(error => {
            showError('加载分类请求失败：' + error.message);
        });
}

// 显示分类
function displayCategories(categories) {
    const categoriesList = document.querySelector('.categories-list');
    categoriesList.innerHTML = '';
    
    // 添加全部分类
    const allCategory = document.createElement('div');
    allCategory.className = 'category active';
    allCategory.setAttribute('data-category', '');
    allCategory.textContent = '全部';
    allCategory.addEventListener('click', () => selectCategory(''));
    categoriesList.appendChild(allCategory);
    
    if (categories && categories.length > 0) {
        categories.forEach(category => {
            const categoryElement = document.createElement('div');
            categoryElement.className = 'category';
            categoryElement.setAttribute('data-category', category.name);
            categoryElement.textContent = `${category.name} (${category.count})`;
            categoryElement.addEventListener('click', () => selectCategory(category.name));
            categoriesList.appendChild(categoryElement);
        });
    } else {
        // 如果没有分类，隐藏分类区域
        document.querySelector('.video-categories').style.display = 'none';
    }
}

// 选择分类
function selectCategory(category) {
    currentCategory = category;
    isSearchMode = false; // 退出搜索模式
    currentPage = 1; // 重置页码
    
    // 更新分类样式
    document.querySelectorAll('.category').forEach(el => {
        el.classList.remove('active');
    });
    
    const activeCategory = document.querySelector(`.category[data-category="${category || ''}"]`);
    if (activeCategory) {
        activeCategory.classList.add('active');
    }
    
    // 隐藏搜索结果容器，显示普通视频列表
    document.querySelector('.search-results-container').style.display = 'none';
    document.querySelector('.video-grid-container').style.display = 'block';
    document.querySelector('.pagination-container').style.display = 'flex';
    
    // 加载对应分类的视频
    loadVideos(1);
}

// 加载视频列表
function loadVideos(page, perPage = null) {
    currentPage = page;
    const videoGrid = document.querySelector('.video-grid');
    videoGrid.innerHTML = '<div class="loading-message">加载中...</div>';
    
    // 构建请求URL，不指定perPage参数，使用后端配置的值
    let url = `/api/videos?page=${page}`;
    if (perPage) {
        url += `&per_page=${perPage}`;
    }
    if (currentCategory) {
        url += `&category=${encodeURIComponent(currentCategory)}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                displayVideos(data.data.videos, videoGrid);
                updatePagination(data.data.pagination);
            } else {
                showError('加载视频失败：' + data.message);
            }
        })
        .catch(error => {
            showError('加载视频请求失败：' + error.message);
        });
}

// 处理搜索
function handleSearch() {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) {
        showError('请输入搜索关键词');
        return;
    }
    
    isSearchMode = true;
    const searchResultsContainer = document.querySelector('.search-results');
    searchResultsContainer.innerHTML = '<div class="loading-message">搜索中...</div>';
    
    // 显示搜索结果容器，隐藏普通视频列表
    document.querySelector('.search-results-container').style.display = 'block';
    document.querySelector('.video-grid-container').style.display = 'none';
    document.querySelector('.pagination-container').style.display = 'none';
    
    // 更新搜索标题
    document.querySelector('.search-results-container h3').textContent = `"${keyword}" 的搜索结果`;
    
    fetch(`/api/search-videos?keyword=${encodeURIComponent(keyword)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                displayVideos(data.data, searchResultsContainer);
                // 显示结果数量
                document.querySelector('.search-results-container h3').textContent = 
                    `"${keyword}" 的搜索结果 (${data.data.length} 个)`;
            } else {
                showError('搜索失败：' + data.message);
            }
        })
        .catch(error => {
            showError('搜索请求失败：' + error.message);
        });
}

// 显示视频列表
function displayVideos(videos, container) {
    container.innerHTML = '';
    
    if (!videos || videos.length === 0) {
        container.innerHTML = '<div class="no-results">暂无视频</div>';
        return;
    }
    
    // 获取默认图片路径
    const defaultImagePath = '/static/images/default.jpg';
    
    videos.forEach(video => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-card';
        videoCard.setAttribute('data-id', video.id);
        videoCard.setAttribute('data-path', video.video_path);
        videoCard.setAttribute('data-name', video.video_name);
        
        // 构建视频缩略图URL和视频URL
        const videoNameWithoutExt = video.video_name.replace(/\.[^/.]+$/, "");
        const thumbnailPath = `/thumbnails/${video.video_path}/${videoNameWithoutExt}.jpg`;
        const videoPath = `/videos/${video.video_path}/${video.video_name}`;
        
        // 移除视频标题的扩展名
        const videoTitle = video.video_name.replace(/\.[^/.]+$/, "");
        
        // 检查是否在移动设备上
        const isMobile = window.innerWidth <= 767;
        
        videoCard.innerHTML = `
            <div class="thumbnail-container">
                <img class="video-thumbnail" src="${defaultImagePath}" alt="${videoTitle}" data-src="${thumbnailPath}">
                <div class="play-button">
                    <i class="fas fa-play"></i>
                </div>
            </div>
            <div class="video-info">
                <div class="video-title">${videoTitle}</div>
                <div class="video-category">${video.category || '未分类'}</div>
            </div>
        `;
        
        // 获取缩略图元素并设置加载事件
        const thumbnailImg = videoCard.querySelector('.video-thumbnail');
        
        // 创建图片加载处理
        const img = new Image();
        img.onload = function() {
            // 缩略图加载成功，替换默认图片
            thumbnailImg.src = thumbnailPath;
        };
        img.onerror = function() {
            // 缩略图加载失败，保持默认图片
            console.log(`缩略图加载失败: ${thumbnailPath}`);
        };
        
        // 开始加载缩略图
        img.src = thumbnailPath;
        
        // 添加点击事件
        videoCard.addEventListener('click', function() {
            playVideo(videoPath, videoTitle);
            
            // 在移动设备上，点击视频后关闭分类面板
            if (isMobile) {
                const categoryHeader = document.querySelector('.category-header');
                const categoriesList = document.querySelector('.categories-list');
                if (!categoryHeader.classList.contains('collapsed')) {
                    categoryHeader.classList.add('collapsed');
                    categoriesList.classList.add('collapsed');
                }
            }
        });
        
        container.appendChild(videoCard);
    });
}

// 播放视频
function playVideo(videoPath, videoName) {
    const playerContainer = document.querySelector('.video-player-container');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoTitle = document.querySelector('.video-info-panel h2');
    const videoDesc = document.querySelector('.video-info-panel p');

    // 提升变量作用域
    let pipCloseBtn;

    // 创建关闭小窗按钮（如果不存在）
    if (!document.querySelector('.pip-close')) {
        pipCloseBtn = document.createElement('button');
        pipCloseBtn.className = 'pip-close';
        pipCloseBtn.innerHTML = '<i class="fas fa-times"></i>';
        pipCloseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (playerContainer.classList.contains('pip-mode')) {
                playerContainer.classList.remove('pip-mode');
                videoPlayer.pause();
            }
        });
        playerContainer.appendChild(pipCloseBtn);
    } else {
        pipCloseBtn = document.querySelector('.pip-close');
    }

    // 显示播放器
    if (playerContainer.classList.contains('hidden')) {
        playerContainer.classList.remove('hidden');
    }

    // 检测播放器是否处于小窗模式
    const wasInPipMode = playerContainer.classList.contains('pip-mode');
    
    // 如果是在小窗模式下点击新视频，暂时放大小窗，但保持小窗状态
    if (wasInPipMode) {
        // 应用临时放大小窗样式，添加过渡动画
        playerContainer.classList.add('pip-animating');
        
        setTimeout(() => {
            playerContainer.classList.add('pip-mode-expanded');
            playerContainer.classList.remove('pip-animating');
            
            // 5秒后或滚动时恢复原始小窗大小
            setTimeout(() => {
                if (playerContainer.classList.contains('pip-mode-expanded')) {
                    // 添加动画过渡
                    playerContainer.classList.add('pip-animating');
                    
                    setTimeout(() => {
                        playerContainer.classList.remove('pip-mode-expanded');
                        
                        setTimeout(() => {
                            playerContainer.classList.remove('pip-animating');
                        }, 500);
                    }, 100);
                }
            }, 5000);
        }, 100);
    } else {
        // 不在小窗模式，保持正常显示
        playerContainer.classList.add('pip-reverse-animating');
        
        setTimeout(() => {
            playerContainer.classList.remove('pip-mode');
            
            setTimeout(() => {
                playerContainer.classList.remove('pip-reverse-animating');
            }, 500);
        }, 100);
    }

    // 更新视频信息
    videoPlayer.src = videoPath;
    videoTitle.textContent = videoName;
    videoDesc.textContent = '正在加载视频...';

    videoPlayer.load();

    // 滚动到视图逻辑
    if (!wasInPipMode && !isElementInViewport(playerContainer)) {
        playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 视频加载处理
    videoPlayer.onloadeddata = function () {
        videoDesc.textContent = '视频已加载，可以开始播放';
        videoPlayer.play().catch(error => {
            console.error('自动播放失败:', error);
            videoDesc.textContent = '点击播放按钮开始播放';
        });
    };

    videoPlayer.onerror = function () {
        videoDesc.textContent = '视频加载失败，请尝试其他视频';
    };

    // 点击恢复逻辑
    if (wasInPipMode) {
        const expandPipOnce = function (e) {
            if (e.target === pipCloseBtn || e.target.closest('.pip-close')) return;
            playerContainer.classList.remove('pip-mode', 'pip-mode-expanded');
            playerContainer.removeEventListener('click', expandPipOnce);
        };
        playerContainer.addEventListener('click', expandPipOnce);
    }
}

// 视口检测辅助函数
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// 修改视频小窗口功能
function handleVideoMinimize() {
    const playerContainer = document.querySelector('.video-player-container');
    if (playerContainer.classList.contains('hidden')) return;
    
    // 如果正在进行动画，不要重复触发
    if (playerContainer.classList.contains('pip-animating') || 
        playerContainer.classList.contains('pip-reverse-animating')) {
        return;
    }
    
    const videoPlayer = document.getElementById('videoPlayer');
    const scrollPosition = window.scrollY;
    const containerTop = playerContainer.offsetTop;
    
    // 移除临时放大状态
    if (scrollPosition > containerTop + 100 && playerContainer.classList.contains('pip-mode-expanded')) {
        playerContainer.classList.remove('pip-mode-expanded');
    }
    
    // 当滚动超过播放器顶部一定距离时，切换到小窗模式
    if (scrollPosition > containerTop + 200 && !playerContainer.classList.contains('pip-mode')) {
        // 添加过渡动画类
        playerContainer.classList.add('pip-animating');
        
        // 延迟添加小窗类，让动画有时间开始
        setTimeout(() => {
            playerContainer.classList.add('pip-mode');
            
            // 动画结束后移除动画类
            setTimeout(() => {
                playerContainer.classList.remove('pip-animating');
            }, 500);
        }, 100);
    } else if (scrollPosition <= containerTop && playerContainer.classList.contains('pip-mode')) {
        // 添加反向过渡动画类
        playerContainer.classList.add('pip-reverse-animating');
        
        // 延迟移除小窗类，让动画有时间完成
        setTimeout(() => {
            playerContainer.classList.remove('pip-mode');
            
            // 动画结束后移除动画类
            setTimeout(() => {
                playerContainer.classList.remove('pip-reverse-animating');
            }, 500);
        }, 100);
    }
}

// 更新分页控件
function updatePagination(pagination) {
    const paginationContainer = document.querySelector('.pagination-container');
    const pageNumbers = document.querySelector('.page-numbers');
    
    // 如果是搜索模式，隐藏分页
    if (isSearchMode) {
        paginationContainer.style.display = 'none';
        return;
        } else {
        paginationContainer.style.display = 'flex';
    }
    
    totalPages = pagination.total_pages;
    currentPage = pagination.current_page;
    
    // 更新分页信息
    document.querySelector('.pagination-info').textContent = 
        `共 ${pagination.total_count} 个视频，${pagination.total_pages} 页`;
    
    // 清空页码区域
    pageNumbers.innerHTML = '';
    
    // 上一页按钮
    document.getElementById('prevPage').disabled = currentPage <= 1;
    
    // 下一页按钮
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    
    // 生成页码按钮
    generatePageButtons(pageNumbers, currentPage, totalPages);
}

// 生成页码按钮
function generatePageButtons(container, currentPage, totalPages) {
    // 如果总页数少于7，显示所有页码
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
            addPageButton(container, i);
        }
        return;
    }
    
    // 总是显示第一页
    addPageButton(container, 1);
    
    // 计算显示的页码范围
    let startPage = Math.max(2, currentPage - 2);
    let endPage = Math.min(totalPages - 1, currentPage + 2);
    
    // 如果当前页靠近开始
    if (currentPage < 5) {
        endPage = 5;
    }
    
    // 如果当前页靠近结束
    if (currentPage > totalPages - 4) {
        startPage = totalPages - 4;
    }
    
    // 添加省略号（如果需要）
    if (startPage > 2) {
        const ellipsis = document.createElement('div');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        container.appendChild(ellipsis);
    }
    
    // 添加中间页码
    for (let i = startPage; i <= endPage; i++) {
        addPageButton(container, i);
    }
    
    // 添加省略号（如果需要）
    if (endPage < totalPages - 1) {
        const ellipsis = document.createElement('div');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        container.appendChild(ellipsis);
    }
    
    // 总是显示最后一页
    if (totalPages > 1) {
        addPageButton(container, totalPages);
    }
}

// 添加页码按钮
function addPageButton(container, pageNum) {
    const button = document.createElement('button');
    button.className = 'page-btn';
    button.textContent = pageNum;
    
    if (pageNum === currentPage) {
        button.classList.add('active');
    }
    
    button.addEventListener('click', () => {
        if (pageNum !== currentPage) {
            loadVideos(pageNum);
        }
    });
    
    container.appendChild(button);
}

// 显示错误消息
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    // 将错误消息添加到页面中
    const container = document.querySelector('.video-grid-container');
    container.prepend(errorElement);
    
    // 3秒后自动消失
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}

// 上一页
function prevPage() {
    if (currentPage > 1) {
        loadVideos(currentPage - 1);
    }
}

// 下一页
function nextPage() {
    if (currentPage < totalPages) {
        loadVideos(currentPage + 1);
    }
}
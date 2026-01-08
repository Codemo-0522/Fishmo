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
    // 设置默认页面标题
    document.title = '留影阁';
    
    // 添加搜索按钮事件监听器
    document.getElementById('searchButton').addEventListener('click', handleSearch);
    
    // 添加搜索框回车事件监听
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 添加页码跳转按钮事件监听
    document.getElementById('jumpButton').addEventListener('click', jumpToPage);
    
    // 添加页码输入框回车事件监听
    document.getElementById('pageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            jumpToPage();
        }
    });
    
    // 添加滚动监听器，控制视频小窗播放
    window.addEventListener('scroll', handleVideoMinimize);
    
    // 添加浏览器历史状态变化事件监听
    window.addEventListener('popstate', handleHistoryChange);
    
    // 加载视频分类
    loadCategories();
    
    // 解析URL参数并加载对应内容
    parseUrlAndLoadContent();
    
    // 默认折叠分类栏
    setTimeout(() => {
        const categoryHeader = document.querySelector('.category-header');
        const categoriesList = document.querySelector('.categories-list');
        if (categoryHeader && categoriesList) {
            categoryHeader.classList.add('collapsed');
            categoriesList.classList.add('collapsed');
        }
    }, 100);

    // 处理视频播放器全屏模式
    const mainVideoPlayer = document.getElementById('mainVideoPlayer');
    const pipVideoPlayer = document.getElementById('pipVideoPlayer');
    const mainPlayer = document.getElementById('mainPlayer');
    const pipPlayer = document.getElementById('pipPlayer');
    
    // 添加移动端滑动进度控制
    if (window.innerWidth <= 767) {
        setupMobileProgressControl(mainVideoPlayer);
        // 手机端禁用小窗功能
        const pipPlayer = document.getElementById('pipPlayer');
        if (pipPlayer) {
            pipPlayer.style.display = 'none';
        }
    }
    
    if (mainVideoPlayer && mainPlayer) {
        // 监听主播放器全屏变化事件
        mainVideoPlayer.addEventListener('fullscreenchange', handleFullScreenChange);
        mainVideoPlayer.addEventListener('webkitfullscreenchange', handleFullScreenChange);
        mainVideoPlayer.addEventListener('mozfullscreenchange', handleFullScreenChange);
        mainVideoPlayer.addEventListener('MSFullscreenChange', handleFullScreenChange);
        
        // 处理全屏变化
        function handleFullScreenChange() {
            if (document.fullscreenElement || 
                document.webkitFullscreenElement || 
                document.mozFullScreenElement || 
                document.msFullscreenElement) {
                // 进入全屏模式
                mainPlayer.classList.add('fullscreen');
            } else {
                // 退出全屏模式
                mainPlayer.classList.remove('fullscreen');
            }
        }
    }
    
    // 只在桌面端启用小窗功能
    if (window.innerWidth > 767 && pipVideoPlayer && pipPlayer) {
        // 监听小窗播放器全屏变化事件
        pipVideoPlayer.addEventListener('fullscreenchange', handlePipFullScreenChange);
        pipVideoPlayer.addEventListener('webkitfullscreenchange', handlePipFullScreenChange);
        pipVideoPlayer.addEventListener('mozfullscreenchange', handlePipFullScreenChange);
        pipVideoPlayer.addEventListener('MSFullscreenChange', handlePipFullScreenChange);
        
        // 处理小窗全屏变化
        function handlePipFullScreenChange() {
            if (document.fullscreenElement || 
                document.webkitFullscreenElement || 
                document.mozFullScreenElement || 
                document.msFullscreenElement) {
                // 进入全屏模式
                pipPlayer.classList.add('fullscreen');
            } else {
                // 退出全屏模式 - 立即重置，避免尺寸变化
                pipPlayer.classList.remove('fullscreen');
                // 强制重新计算样式
                pipVideoPlayer.offsetHeight;
            }
        }
    }
}

// 解析URL参数并加载内容
function parseUrlAndLoadContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('page')) || 1;
    const category = urlParams.get('category') || '';
    const search = urlParams.get('search') || '';
    
    // 更新当前状态变量
    currentPage = page;
    currentCategory = category;
    
    if (search) {
        // 如果有搜索参数，进入搜索模式
        document.getElementById('searchInput').value = search;
        isSearchMode = true;
        
        // 显示搜索结果容器，隐藏普通视频列表
        document.querySelector('.search-results-container').style.display = 'block';
        document.querySelector('.video-grid-container').style.display = 'none';
        
        // 加载搜索结果
        loadSearchResults(search, page, false); // 不推送历史记录，因为已经在URL中
    } else {
        // 否则加载普通视频页，退出搜索模式
        isSearchMode = false;
        
        // 更新分类样式
        document.querySelectorAll('.category').forEach(el => {
            el.classList.remove('active');
        });
        
        const activeCategory = document.querySelector(`.category[data-category="${category || ''}"]`);
        if (activeCategory) {
            activeCategory.classList.add('active');
        }
        
        // 显示视频列表，隐藏搜索结果
        document.querySelector('.search-results-container').style.display = 'none';
        document.querySelector('.video-grid-container').style.display = 'block';
        document.querySelector('.pagination-container').style.display = 'flex';
        
        // 加载视频
        loadVideos(page, null, false); // 不推送历史记录，因为已经在URL中
    }
}

// 处理浏览器历史状态变化
function handleHistoryChange(event) {
    // 重新解析URL并加载内容
    parseUrlAndLoadContent();
}

// 更新URL参数
function updateUrlParams(params = {}) {
    // 创建新的URL参数对象
    const urlParams = new URLSearchParams(window.location.search);
    
    // 更新参数
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== '') {
            urlParams.set(key, params[key]);
        } else {
            urlParams.delete(key);
        }
    });
    
    // 构建新URL
    const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
    
    // 更新浏览器历史
    window.history.pushState({ path: newUrl }, '', newUrl);
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
    allCategory.className = 'category';
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
        
        // 设置当前分类的活跃状态
        const activeCategory = document.querySelector(`.category[data-category="${currentCategory || ''}"]`);
        if (activeCategory) {
            activeCategory.classList.add('active');
        } else {
            allCategory.classList.add('active');
        }
    } else {
        // 如果没有分类，隐藏分类区域
        document.querySelector('.video-categories').style.display = 'none';
        allCategory.classList.add('active');
    }
}

// 选择分类
function selectCategory(category) {
    currentCategory = category;
    isSearchMode = false; // 退出搜索模式
    
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
    
    // 清空搜索框
    document.getElementById('searchInput').value = '';
    
    // 更新URL参数
    updateUrlParams({
        page: 1,
        category: category,
        search: null
    });
    
    // 加载对应分类的视频
    loadVideos(1);
}

// 加载视频列表
function loadVideos(page, perPage = null, pushState = true) {
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
    
    // 如果需要,更新浏览器历史
    if (pushState) {
        updateUrlParams({
            page: page,
            category: currentCategory
        });
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                displayVideos(data.data.videos, videoGrid);
                updatePagination(data.data.pagination);
                
                // 滚动到页面顶部
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else {
                showError('加载视频失败：' + data.message);
            }
        })
        .catch(error => {
            showError('加载视频请求失败：' + error.message);
        });
}

// 处理搜索
function handleSearch(pushState = true) {
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
    
    // 搜索时始终从第一页开始，不使用URL中的页码
    const page = 1;
    
    // 更新搜索标题
    document.querySelector('.search-results-container h3').textContent = `"${keyword}" 的搜索结果`;
    
    // 如果需要,更新浏览器历史
    if (pushState) {
        updateUrlParams({
            search: keyword,
            page: page,
            category: null
        });
    }
    
    // 加载搜索结果（带分页）
    loadSearchResults(keyword, page, pushState);
}

// 加载搜索结果（新增函数）
function loadSearchResults(keyword, page = 1, pushState = true) {
    if (!keyword) return;
    
    const searchResultsContainer = document.querySelector('.search-results');
    const paginationContainer = document.querySelector('.pagination-container');
    
    searchResultsContainer.innerHTML = '<div class="loading-message">搜索中...</div>';
    
    // 构建搜索请求URL
    const url = `/api/search-videos?keyword=${encodeURIComponent(keyword)}&page=${page}`;
    
    // 如果需要,更新浏览器历史
    if (pushState) {
        updateUrlParams({
            search: keyword,
            page: page
        });
    }
    
    // 发起搜索请求
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 显示搜索结果
                displayVideos(data.data.videos, searchResultsContainer);
                
                // 更新结果标题，显示结果数量
                document.querySelector('.search-results-container h3').textContent = 
                    `"${keyword}" 的搜索结果 (共 ${data.data.pagination.total_count} 个)`;
                
                // 更新分页信息
                updateSearchPagination(data.data.pagination, keyword);
                
                // 显示分页控件
                paginationContainer.style.display = 'flex';
                
                // 滚动到页面顶部
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            } else {
                searchResultsContainer.innerHTML = '<div class="no-results">没有找到匹配的视频</div>';
                paginationContainer.style.display = 'none';
                showError('搜索失败：' + data.message);
            }
        })
        .catch(error => {
            searchResultsContainer.innerHTML = '<div class="no-results">搜索请求出错</div>';
            paginationContainer.style.display = 'none';
            showError('搜索请求失败：' + error.message);
        });
}

// 更新搜索结果分页控件（新增函数）
function updateSearchPagination(pagination, keyword) {
    const paginationContainer = document.querySelector('.pagination-container');
    const pageNumbers = document.querySelector('.page-numbers');
    const pageInput = document.getElementById('pageInput');
    
    totalPages = pagination.total_pages;
    currentPage = pagination.current_page;
    
    // 更新分页信息
    document.querySelector('.pagination-info').textContent = 
        `共 ${pagination.total_count} 个结果，${pagination.total_pages} 页`;
    
    // 更新页码输入框最大值
    pageInput.setAttribute('max', totalPages);
    pageInput.placeholder = `1-${totalPages}`;
    
    // 清空页码区域
    pageNumbers.innerHTML = '';
    
    // 上一页按钮
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('prevPage').onclick = function() {
        if (currentPage > 1) {
            loadSearchResults(keyword, currentPage - 1);
        }
    };
    
    // 下一页按钮
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    document.getElementById('nextPage').onclick = function() {
        if (currentPage < totalPages) {
            loadSearchResults(keyword, currentPage + 1);
        }
    };
    
    // 生成页码按钮
    generateSearchPageButtons(pageNumbers, currentPage, totalPages, keyword);
    
    // 显示分页控件
    paginationContainer.style.display = 'flex';
}

// 生成搜索页码按钮（新增函数）
function generateSearchPageButtons(container, currentPage, totalPages, keyword) {
    // 如果总页数少于7，显示所有页码
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
            addSearchPageButton(container, i, keyword);
        }
        return;
    }
    
    // 总是显示第一页
    addSearchPageButton(container, 1, keyword);
    
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
        addSearchPageButton(container, i, keyword);
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
        addSearchPageButton(container, totalPages, keyword);
    }
}

// 添加搜索页码按钮（新增函数）
function addSearchPageButton(container, pageNum, keyword) {
    const button = document.createElement('button');
    button.className = 'page-btn';
    button.textContent = pageNum;
    
    if (pageNum === currentPage) {
        button.classList.add('active');
    }
    
    button.addEventListener('click', () => {
        if (pageNum !== currentPage) {
            loadSearchResults(keyword, pageNum);
        }
    });
    
    container.appendChild(button);
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
        
        // 存储视频时长和画质信息(如果有)
        if (video.video_duration) {
            videoCard.setAttribute('data-duration', video.video_duration);
        }
        if (video.video_quality) {
            videoCard.setAttribute('data-quality', video.video_quality);
        }
        
        // 🎯 使用后端返回的完整URL，不再前端拼接
        const videoNameWithoutExt = video.video_name.replace(/\.[^/.]+$/, "");
        
        // 构建缩略图URL
        const timestamp = new Date().getTime();
        let thumbnailPath;
        if (video.thumbnail_url) {
            // 使用后端返回的缩略图URL
            thumbnailPath = `${video.thumbnail_url}?t=${timestamp}`;
        } else {
            // 兼容旧版本：前端拼接缩略图路径
            const videoPath = video.video_path.replace(/\\/g, '/');
            thumbnailPath = `/thumbnails/${videoPath}/${videoNameWithoutExt}.jpg?t=${timestamp}`;
        }
        
        // 🎯 使用后端返回的完整播放URL
        const videoFullPath = video.video_play_url || `/videos/${video.video_path}/${video.video_name}`;
        
        // 移除视频标题的扩展名
        const videoTitle = video.video_name.replace(/\.[^/.]+$/, "");
        
        // 构建VIP标识HTML
        const vipBadge = video.is_vip ? '<span class="vip-badge">VIP</span>' : '';
        
        // 检查是否在移动设备上
        const isMobile = window.innerWidth <= 767;
        
        // 格式化视频时长和画质信息(如果有)
        const durationInfo = video.video_duration ? `<div class="video-duration"><i class="fas fa-clock"></i> ${video.video_duration}</div>` : '';
        const qualityInfo = video.video_quality ? `<div class="video-quality"><i class="fas fa-film"></i> ${video.video_quality}</div>` : '';
        
        videoCard.innerHTML = `
            <div class="thumbnail-container">
                <img class="video-thumbnail" src="${defaultImagePath}" alt="${videoTitle}" data-src="${thumbnailPath}">
                <div class="play-button">
                    <i class="fas fa-play"></i>
                </div>
                ${durationInfo}
                <!--${vipBadge}-->
            </div>
            <div class="video-info">
                <div class="video-title">${videoTitle}</div>
                <div class="video-details">
                    <div class="video-category"><i class="fas fa-folder"></i> ${video.category || '未分类'}</div>
                    ${qualityInfo}
                </div>
            </div>
        `;
        
        // 获取缩略图元素并设置加载事件
        const thumbnailImg = videoCard.querySelector('.video-thumbnail');
        
        // 创建图片加载处理
        const loadThumbnail = (retryCount = 0) => {
            const img = new Image();
            
            img.onload = function() {
                // 缩略图加载成功，替换默认图片
                thumbnailImg.src = thumbnailPath;
            };
            
            img.onerror = function() {
                // 缩略图加载失败
                console.log(`缩略图加载失败: ${thumbnailPath}`);
                
                // 最多重试2次
                if (retryCount < 2) {
                    console.log(`重试加载缩略图 (${retryCount + 1}/2): ${thumbnailPath}`);
                    // 延迟200ms重试，避免同时请求过多
                    setTimeout(() => loadThumbnail(retryCount + 1), 200 * (retryCount + 1));
                } else {
                    // 重试次数用完，保持默认图片
                    console.log(`重试加载缩略图失败，使用默认图片: ${thumbnailPath}`);
                    thumbnailImg.onerror = null; // 防止循环触发错误
                }
            };
            
            // 开始加载缩略图
            img.src = thumbnailPath;
        };
        
        // 开始加载缩略图
        loadThumbnail();
        
                // 添加点击事件
        videoCard.addEventListener('click', function() {
            const mainVideoPlayer = document.getElementById('mainVideoPlayer');
            const pipVideoPlayer = document.getElementById('pipVideoPlayer');
            
            // 检查是否是当前播放的视频
            const isCurrentPlaying = this.classList.contains('playing');
            
            if (isCurrentPlaying) {
                // 如果是当前播放的视频，切换播放/暂停状态
                if (!mainVideoPlayer.paused) {
                    // 当前正在播放，暂停视频
                    mainVideoPlayer.pause();
                    // 只在桌面端暂停小窗
                    if (window.innerWidth > 767) {
                        pipVideoPlayer.pause();
                    }
                    // 切换图标为播放
                    const playButton = this.querySelector('.play-button i');
                    if (playButton) {
                        playButton.className = 'fas fa-play';
                    }
                } else {
                    // 当前已暂停，继续播放
                    mainVideoPlayer.play().catch(e => console.log('播放失败:', e));
                    // 只在桌面端播放小窗
                    if (window.innerWidth > 767) {
                        pipVideoPlayer.play().catch(e => console.log('小窗播放失败:', e));
                    }
                    // 切换图标为暂停
                    const playButton = this.querySelector('.play-button i');
                    if (playButton) {
                        playButton.className = 'fas fa-pause';
                    }
                }
            } else {
                // 如果不是当前播放的视频，播放新视频
                playVideo(
                    videoFullPath, 
                    videoTitle, 
                    video.video_duration || null, 
                    video.video_quality || null
                );
            }
            
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
function playVideo(videoPath, videoName, duration, quality) {
    const mainPlayer = document.getElementById('mainPlayer');
    const pipPlayer = document.getElementById('pipPlayer');
    const mainVideoPlayer = document.getElementById('mainVideoPlayer');
    const pipVideoPlayer = document.getElementById('pipVideoPlayer');
    const mainTitle = mainPlayer.querySelector('.video-info-panel h2');
    const mainDesc = mainPlayer.querySelector('.video-info-panel p');
    const pipCloseBtn = document.getElementById('pipCloseBtn');

    // 更新播放状态UI
    updateVideoPlayState(videoPath, videoName);

    // 显示大窗播放器，隐藏小窗播放器
    mainPlayer.classList.remove('hidden');
    pipPlayer.classList.add('hidden');

    // 更新大窗播放器信息
    mainVideoPlayer.src = videoPath;
    mainTitle.textContent = videoName;
    
    // 修改页面标题为视频名称
    document.title = videoName + ' | 留影阁';
    
    // 添加视频时长和画质信息
    let descText = '正在加载视频...';
    const videoDetails = [];
    if (duration) {
        videoDetails.push(`时长: ${duration}`);
    }
    if (quality) {
        videoDetails.push(`画质: ${quality}`);
    }
    
    if (videoDetails.length > 0) {
        descText = videoDetails.join(' | ') + '<br>' + descText;
    }
    
    mainDesc.innerHTML = descText;

    // 只在桌面端同步小窗播放器
    if (window.innerWidth > 767) {
        pipVideoPlayer.src = videoPath;
        // 设置播放器同步
        setupPlayerSync(mainVideoPlayer, pipVideoPlayer);
    }

    mainVideoPlayer.load();

    // 滚动到视图逻辑 - 只有在大窗隐藏时才滚动
    if (mainPlayer.classList.contains('hidden')) {
        // 大窗隐藏时，滚动到顶部显示大窗
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // 如果大窗已经显示，检查是否需要显示小窗
        // 手动触发一次滚动监听逻辑
        setTimeout(() => {
            handleVideoMinimize();
        }, 100);
    }

    // 视频加载处理
    mainVideoPlayer.onloadeddata = function () {
        let loadedText = '视频已加载，可以开始播放';
        if (videoDetails.length > 0) {
            loadedText = videoDetails.join(' | ') + '<br>' + loadedText;
        }
        mainDesc.innerHTML = loadedText;
        
        mainVideoPlayer.play().catch(error => {
            console.error('自动播放失败:', error);
            let playText = '点击播放按钮开始播放';
            if (videoDetails.length > 0) {
                playText = videoDetails.join(' | ') + '<br>' + playText;
            }
            mainDesc.innerHTML = playText;
        });
    };

    mainVideoPlayer.onerror = function () {
        let errorText = '视频加载失败，请尝试其他视频';
        if (videoDetails.length > 0) {
            errorText = videoDetails.join(' | ') + '<br>' + errorText;
        }
        mainDesc.innerHTML = errorText;
    };

    // 小窗关闭按钮事件（只在桌面端）
    if (window.innerWidth > 767) {
        pipCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            // 只隐藏小窗，大窗保持显示状态
            pipPlayer.classList.add('hidden');
            pipVideoPlayer.pause();
        });
    }
}

// 设置播放器同步
function setupPlayerSync(mainPlayer, pipPlayer) {
    // 手机端禁用同步功能
    if (window.innerWidth <= 767) {
        return;
    }
    
    let isSyncing = false; // 防止循环触发
    
    // 主播放器事件
    mainPlayer.addEventListener('play', function() {
        if (!isSyncing) {
            isSyncing = true;
            pipPlayer.currentTime = mainPlayer.currentTime;
            pipPlayer.play().catch(e => console.log('小窗播放失败:', e));
            // 同步更新列表图标
            updatePlayPauseIcon(true);
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
    
    mainPlayer.addEventListener('pause', function() {
        if (!isSyncing) {
            isSyncing = true;
            pipPlayer.pause();
            // 同步更新列表图标
            updatePlayPauseIcon(false);
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
    
    mainPlayer.addEventListener('seeked', function() {
        if (!isSyncing) {
            isSyncing = true;
            pipPlayer.currentTime = mainPlayer.currentTime;
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
    
    // 小窗播放器事件
    pipPlayer.addEventListener('play', function() {
        if (!isSyncing) {
            isSyncing = true;
            mainPlayer.currentTime = pipPlayer.currentTime;
            mainPlayer.play().catch(e => console.log('主播放器播放失败:', e));
            // 同步更新列表图标
            updatePlayPauseIcon(true);
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
    
    pipPlayer.addEventListener('pause', function() {
        if (!isSyncing) {
            isSyncing = true;
            mainPlayer.pause();
            // 同步更新列表图标
            updatePlayPauseIcon(false);
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
    
    pipPlayer.addEventListener('seeked', function() {
        if (!isSyncing) {
            isSyncing = true;
            mainPlayer.currentTime = pipPlayer.currentTime;
            setTimeout(() => { isSyncing = false; }, 100);
        }
    });
}

// 更新播放/暂停图标
function updatePlayPauseIcon(isPlaying) {
    const playingCard = document.querySelector('.video-card.playing');
    if (playingCard) {
        const playButton = playingCard.querySelector('.play-button i');
        if (playButton) {
            playButton.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }
}

// 设置移动端滑动进度控制
function setupMobileProgressControl(videoPlayer) {
    if (!videoPlayer) return;
    
    let isDragging = false;
    let startY = 0;
    let startTime = 0;
    let videoDuration = 0;
    
    // 触摸开始
    videoPlayer.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            isDragging = true;
            startY = e.touches[0].clientX; // 改为X轴
            startTime = videoPlayer.currentTime;
            videoDuration = videoPlayer.duration || 0;
            
            // 防止页面滚动
            e.preventDefault();
        }
    }, { passive: false });
    
    // 触摸移动
    videoPlayer.addEventListener('touchmove', function(e) {
        if (isDragging && e.touches.length === 1) {
            const currentY = e.touches[0].clientX; // 改为X轴
            const deltaY = currentY - startY; // 向右滑动为正
            const screenWidth = window.innerWidth;
            
            // 计算进度变化（每100px屏幕宽度对应30%的视频进度）
            const progressChange = (deltaY / screenWidth) * 0.3;
            const newTime = startTime + (progressChange * videoDuration);
            
            // 限制在有效范围内
            const clampedTime = Math.max(0, Math.min(newTime, videoDuration));
            
            // 更新视频进度
            videoPlayer.currentTime = clampedTime;
            
            // 防止页面滚动
            e.preventDefault();
        }
    }, { passive: false });
    
    // 触摸结束
    videoPlayer.addEventListener('touchend', function(e) {
        isDragging = false;
    });
    
    // 添加视觉提示
    videoPlayer.style.cursor = 'ns-resize';
}

// 更新视频播放状态UI
function updateVideoPlayState(videoPath, videoName) {
    // 清除所有视频卡片的播放状态
    document.querySelectorAll('.video-card').forEach(card => {
        card.classList.remove('playing');
        const playButton = card.querySelector('.play-button i');
        if (playButton) {
            playButton.className = 'fas fa-play';
        }
    });
    
    // 设置当前播放视频的状态
    // 从videoPath中提取video_path部分来匹配
    const videoPathParts = videoPath.split('/');
    const videoFileName = videoPathParts[videoPathParts.length - 1];
    const videoDir = videoPathParts[videoPathParts.length - 2];
    
    const currentCard = document.querySelector(`.video-card[data-name="${videoFileName}"]`);
    if (currentCard) {
        currentCard.classList.add('playing');
        const playButton = currentCard.querySelector('.play-button i');
        if (playButton) {
            playButton.className = 'fas fa-pause';
        }
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
    // 手机端禁用小窗功能
    if (window.innerWidth <= 767) {
        return;
    }
    
    const mainPlayer = document.getElementById('mainPlayer');
    const pipPlayer = document.getElementById('pipPlayer');
    
    // 如果大窗隐藏，说明没有在播放视频，直接返回
    if (mainPlayer.classList.contains('hidden')) {
        return;
    }
    
    // 检查大窗播放器是否在视口中可见
    const mainVideoPlayer = document.getElementById('mainVideoPlayer');
    const rect = mainVideoPlayer.getBoundingClientRect();
    const isMainVisible = rect.bottom > 0 && rect.top < window.innerHeight;
    
    if (isMainVisible) {
        // 大窗在视口中可见，隐藏小窗
        pipPlayer.classList.add('hidden');
    } else {
        // 大窗不在视口中，显示小窗
        pipPlayer.classList.remove('hidden');
    }
}

// 更新分页控件
function updatePagination(pagination) {
    const paginationContainer = document.querySelector('.pagination-container');
    const pageNumbers = document.querySelector('.page-numbers');
    const pageInput = document.getElementById('pageInput');
    
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
    
    // 更新页码输入框最大值
    pageInput.setAttribute('max', totalPages);
    pageInput.placeholder = `1-${totalPages}`;
    
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
        if (isSearchMode) {
            // 搜索模式下，使用关键词加载上一页
            const keyword = document.getElementById('searchInput').value.trim();
            loadSearchResults(keyword, currentPage - 1);
        } else {
            // 普通模式下，加载上一页视频
            loadVideos(currentPage - 1);
        }
    }
}

// 下一页
function nextPage() {
    if (currentPage < totalPages) {
        if (isSearchMode) {
            // 搜索模式下，使用关键词加载下一页
            const keyword = document.getElementById('searchInput').value.trim();
            loadSearchResults(keyword, currentPage + 1);
        } else {
            // 普通模式下，加载下一页视频
            loadVideos(currentPage + 1);
        }
    }
}

// 跳转到指定页码
function jumpToPage() {
    const pageInput = document.getElementById('pageInput');
    let targetPage = parseInt(pageInput.value);
    
    // 验证页码输入
    if (isNaN(targetPage) || targetPage < 1) {
        showError('请输入有效的页码');
        pageInput.value = '';
        return;
    }
    
    // 限制页码范围在1到总页数之间
    if (targetPage > totalPages) {
        targetPage = totalPages;
        pageInput.value = totalPages;
    }
    
    // 如果是当前页，不执行跳转
    if (targetPage === currentPage) {
        return;
    }
    
    // 根据当前模式执行跳转
    if (isSearchMode) {
        // 搜索模式下跳转
        const keyword = document.getElementById('searchInput').value.trim();
        loadSearchResults(keyword, targetPage);
    } else {
        // 普通模式下跳转
        loadVideos(targetPage);
    }
    
    // 清空输入框
    pageInput.value = '';
}
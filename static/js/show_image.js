// static/js/show_image.js
// 全局变量
let allImagesData = []; // 存储所有图片数据
let imagesData = [];    // 当前页面显示的图片数据
let currentPage = 1;    // 当前页码
let imagesPerPage = 30; // 每页显示的图片数量
let totalPages = 1;     // 总页数
let collectionId = null; // 当前图集ID
let subsetId = null;     // 当前子集ID
let collectionName = '图片集'; // 图集名称，默认值

// 获取URL中的参数
function getUrlParam(name) {
    var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
    var r = window.location.search.substr(1).match(reg);
    if (r != null) return decodeURIComponent(r[2]); return null;
}

// 显示错误消息
function showError(message) {
    const imagesGrid = document.getElementById('imagesGrid');
    imagesGrid.innerHTML = `<div class="error-message">${message}</div>`;
    console.error(message);
}

// 在页面加载时获取图片数据
document.addEventListener('DOMContentLoaded', function() {
    // 禁用浏览器自动恢复滚动位置功能
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
        console.log('已禁用浏览器自动恢复滚动位置');
    }
    
    // 显示环境信息，帮助调试
    console.log('浏览器: ' + navigator.userAgent);
    console.log('窗口尺寸: ' + window.innerWidth + 'x' + window.innerHeight);
    
    // 获取URL中的参数
    // 优先从id参数获取，如果没有则尝试从collection_id参数获取
    collectionId = getUrlParam('id');
    if (!collectionId) {
        collectionId = getUrlParam('collection_id');
    }

    // 获取页码和子集参数（如果有）
    const pageParam = getUrlParam('page');
    if (pageParam && !isNaN(parseInt(pageParam))) {
        currentPage = parseInt(pageParam);
    }
    
    subsetId = getUrlParam('subset');
    if (subsetId) {
        subsetId = parseInt(subsetId);
        
        // 如果没有明确的页码参数，则使用子集序号+1作为页码
        if (!pageParam) {
            currentPage = subsetId + 1;
        }
    }
    
    if (!collectionId) {
        showError('未指定图片集ID');
        return;
    }
    
    console.log(`准备加载图片集: ${collectionId}, 页码: ${currentPage}, 子集: ${subsetId || '全部'}`);
    
    // 显示加载中状态
    document.getElementById('imagesGrid').innerHTML = '<div class="loading-message">正在加载图片...</div>';
    
    // 设置分页按钮事件
    document.getElementById('prevPage').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPage').addEventListener('click', goToNextPage);

    // 测试静态图片是否可以加载
    testStaticImage();
    
    // 发起API请求获取图片数据
    fetch(`/api/get_collection_images/${collectionId}`)
        .then(response => {
            console.log('API响应状态码:', response.status);
            
            if (response.status === 403) {
                return response.json().then(data => {
                    throw new Error('没有权限查看此图片集，请先登录或升级为VIP用户');
                });
            }
            
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || '获取图片数据失败');
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            console.log('获取到图片数据:', data);
            console.log('API响应中的原始数据字段:', Object.keys(data));
            
            // 详细打印API响应数据结构，以便排查问题
            console.log('详细的API响应数据结构:', JSON.stringify(data, null, 2));
            
            // 如果数据在data字段中，使用data字段
            const responseData = data.data || data;
            console.log('处理后的响应数据:', responseData);
            
            // 保存图片数据到全局变量
            allImagesData = responseData.images || data.images;
            
            // 保存图集名称到全局变量，使用与image.html一致的方式获取名称
            collectionName = getCollectionNameFromData(responseData);
            console.log('图集名称:', collectionName);
            
            if (!allImagesData || allImagesData.length === 0) {
                throw new Error('没有找到图片数据');
            }
            
            if (allImagesData.length > 0) {
                // 打印第一张图片的详细信息，用于调试
                console.log('第一张图片详情:', allImagesData[0]);
                console.log('第一张图片路径:', allImagesData[0].full_path);
                
                // 测试第一张图片是否可以加载
                testImageLoad('/images/' + allImagesData[0].full_path);
            }
            
            // 计算总页数
            totalPages = Math.ceil(allImagesData.length / imagesPerPage);
            console.log(`图片总数: ${allImagesData.length}, 每页显示: ${imagesPerPage}, 总页数: ${totalPages}`);
            
            // 确保当前页码有效
            if (currentPage < 1) currentPage = 1;
            if (currentPage > totalPages) currentPage = totalPages;
            
            // 更新页面标题，显示图集名称和页码
            updatePageTitle();
            
            // 更新页码信息
            updatePageInfo();
            
            // 创建子集
            createSubsets();
            
            // 加载当前页数据
            loadCurrentPageData();
            
            // 显示图片
            displayImages();
        })
        .catch(error => {
            console.error('获取图片数据出错:', error);
            if (error.message.includes('权限')) {
                showError('没有权限查看此图片集，请先登录或升级为VIP用户');
            } else {
                showError('加载图片失败: ' + error.message);
            }
        });
});

// 测试静态图片是否可以加载
function testStaticImage() {
    const defaultImage = new Image();
    defaultImage.onload = function() {
        console.log('默认图片加载成功');
    };
    defaultImage.onerror = function() {
        console.error('默认图片加载失败！请检查static/images/default.jpg是否存在');
    };
    defaultImage.src = '/static/images/default.jpg';
}

// 测试图片是否可以加载
function testImageLoad(src) {
    console.log('测试图片加载:', src);
    const testImg = new Image();
    testImg.onload = function() {
        console.log('图片加载测试成功:', src);
    };
    testImg.onerror = function() {
        console.error('图片加载测试失败:', src);
        // 尝试修复路径并重新测试
        if (src.startsWith('/images//')) {
            console.log('尝试修复双斜杠问题...');
            testImageLoad(src.replace('/images//', '/images/'));
        } else if (src.startsWith('/images/')) {
            console.log('尝试直接使用路径而不通过/images/路由...');
            testImageLoad(src.replace('/images/', '/'));
        }
    };
    testImg.src = src;
}

// 加载当前页数据
function loadCurrentPageData() {
    console.log(`开始加载数据：当前页码=${currentPage}, 子集ID=${subsetId}`);
    
    // 如果指定了子集
    if (subsetId !== null) {
        const subsetIndex = parseInt(subsetId);
        
        // 计算相对于子集的偏移量
        const pageOffset = currentPage - (subsetIndex + 1);
        
        console.log(`子集浏览模式：子集索引=${subsetIndex}, 页码偏移=${pageOffset}`);
        
        // 计算子集的基本起始索引
        const subsetBaseIndex = subsetIndex * imagesPerPage;
        
        // 根据页码偏移量计算实际的起始和结束索引
        const startIndex = subsetBaseIndex + (pageOffset * imagesPerPage);
        const endIndex = Math.min(startIndex + imagesPerPage, allImagesData.length);
        
        console.log(`计算的索引范围：${startIndex} 到 ${endIndex}`);
        
        // 检查索引是否有效
        if (startIndex >= 0 && startIndex < allImagesData.length) {
            // 获取数据
            imagesData = allImagesData.slice(startIndex, endIndex);
            console.log(`成功加载子集数据：${imagesData.length}张图片`);
        } else {
            console.warn(`索引超出范围，无法加载数据`);
            imagesData = [];
        }
    } else {
        // 常规浏览模式：直接根据页码计算
        const startIndex = (currentPage - 1) * imagesPerPage;
        const endIndex = Math.min(startIndex + imagesPerPage, allImagesData.length);
        
        console.log(`常规浏览模式：索引范围 ${startIndex} 到 ${endIndex}`);
        
        if (startIndex >= 0 && startIndex < allImagesData.length) {
            imagesData = allImagesData.slice(startIndex, endIndex);
            console.log(`成功加载页面数据：${imagesData.length}张图片`);
        } else {
            console.warn(`索引超出范围，无法加载数据`);
            imagesData = [];
        }
    }
}

// 创建子集
function createSubsets() {
    const subsetGrid = document.getElementById('subsetGrid');
    subsetGrid.innerHTML = '';
    
    // 计算子集数量
    const subsetCount = Math.ceil(allImagesData.length / imagesPerPage);
    
    for (let i = 0; i < subsetCount; i++) {
        const startIndex = i * imagesPerPage;
        const endIndex = Math.min(startIndex + imagesPerPage, allImagesData.length);
        const subsetImages = allImagesData.slice(startIndex, endIndex);
        
        if (subsetImages.length === 0) continue;
        
        // 创建子集容器
        const subsetContainer = document.createElement('div');
        subsetContainer.className = 'subset-item';
        subsetContainer.setAttribute('data-subset', i);
        
        // 设置子集点击事件
        subsetContainer.addEventListener('click', function() {
            // 更新URL参数并跳转，同时保存当前滚动位置
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('subset', i);
            const displayPage = i + 1;
            newUrl.searchParams.set('page', displayPage);
            newUrl.searchParams.set('scroll', window.scrollY); // 保存滚动位置
            window.location.href = newUrl.href; // 页面跳转
        });
        
        // 使用子集中的第一张图片作为封面
        const coverImage = document.createElement('img');
        coverImage.src = '/static/images/default.jpg';
        coverImage.alt = `子集 ${i + 1}`;
        
        // 尝试加载子集封面
        if (subsetImages[0] && subsetImages[0].full_path) {
            const coverPath = '/images/' + subsetImages[0].full_path;
            setTimeout(() => {
                const testImg = new Image();
                testImg.onload = function() {
                    coverImage.src = coverPath;
                };
                testImg.onerror = function() {
                    console.error(`子集${i + 1}封面加载失败: ${coverPath}`);
                };
                testImg.src = coverPath;
            }, 100);
        }
        
        // 子集信息
        const subsetInfo = document.createElement('div');
        subsetInfo.className = 'subset-info';
        subsetInfo.textContent = `子集 ${i + 1} (${subsetImages.length}张)`;
        
        // 添加元素到容器
        subsetContainer.appendChild(coverImage);
        subsetContainer.appendChild(subsetInfo);
        subsetGrid.appendChild(subsetContainer);
    }
}

// 更新页码信息
function updatePageInfo() {
    document.getElementById('pageInfo').textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
    
    // 禁用/启用分页按钮
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    
    // 同时更新页面标题
    updatePageTitle();
    
    console.log(`页码信息更新: 当前第${currentPage}页, 共${totalPages}页`);
}

// 前往上一页
function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('page', currentPage);
        newUrl.searchParams.set('scroll', window.scrollY); // 保存滚动位置
        window.location.href = newUrl.href; // 页面跳转
    }
}

// 前往下一页
function goToNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('page', currentPage);
        newUrl.searchParams.set('scroll', window.scrollY); // 保存滚动位置
        window.location.href = newUrl.href; // 页面跳转
    }
}

// 显示图片集中的所有图片
function displayImages() {
    const imagesGrid = document.getElementById('imagesGrid');
    imagesGrid.innerHTML = '';
    
    if (!imagesData || imagesData.length === 0) {
        imagesGrid.innerHTML = '<div class="loading-message">该图片集中没有图片</div>';
        console.warn('图片集中没有图片或图片数据为空');
        return;
    }
    
    console.log(`准备渲染${imagesData.length}张图片`);
    
    // 获取默认图片路径
    const defaultImagePath = '/static/images/default.jpg';
    
    // 创建所有图片元素 - 自适应布局
    imagesData.forEach((image, index) => {
        console.log(`处理第${index+1}张图片:`, image);
        
        // 创建图片容器
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-item';
        
        // 创建图片元素
        const imgElement = document.createElement('img');
        imgElement.src = defaultImagePath;
        imgElement.alt = `图片 ${index + 1}`;
        
        // 处理图片路径
        let fullImagePath = '/images/' + image.full_path;
        
        // 检测并修复可能的路径问题
        if (fullImagePath.includes('//')) {
            fullImagePath = fullImagePath.replace('//', '/');
            console.log(`修复图片路径中的双斜杠: ${fullImagePath}`);
        }
        
        console.log(`图片路径: ${fullImagePath}`);
        
        // 设置图片加载和错误处理
        imgElement.onload = function() {
            console.log(`图片加载成功: ${fullImagePath}`);
        };
        
        imgElement.onerror = function() {
            console.error(`图片加载失败: ${fullImagePath}`);
            this.src = defaultImagePath;
            
            if (index === 0) {
                console.error('第一张图片加载失败，尝试替代方案');
                setTimeout(() => {
                    const directPath = image.full_path;
                    console.log(`尝试直接路径: ${directPath}`);
                    this.src = directPath;
                }, 1000);
                console.log('图片详细信息:', image);
            }
        };
        
        // 将图片添加到容器
        imageContainer.appendChild(imgElement);
        imagesGrid.appendChild(imageContainer);
        
        // 延迟设置图片源
        setTimeout(() => {
            imgElement.src = fullImagePath;
        }, 50 * index);
    });

    // 从URL恢复滚动位置（修复版）
    const scrollY = getUrlParam('scroll');
    // 只有在通过浏览器回退/前进按钮导航时，才恢复滚动位置
    if (scrollY && !isNaN(parseInt(scrollY)) && performance.getEntriesByType('navigation')[0].type === 'back_forward') {
        // 延迟滚动，确保所有图片加载完成
        setTimeout(() => {
            window.scrollTo(0, parseInt(scrollY));
            console.log(`已恢复滚动位置到: ${scrollY}px`);
        }, 800);
    } else {
        // 新页面加载时强制滚动到顶部
        window.scrollTo(0, 0);
    }
}

// 简化版的滚动到顶部函数
function forceScrollToTop() {
    window.scrollTo(0, 0);
}

// 更新标题函数
function updatePageTitle() {
    let title = `${collectionName}  第${currentPage}页`;
    document.title = title;
    console.log('更新页面标题:', title);
}

// 获取图集名称
function getCollectionNameFromData(data) {
    console.log('尝试从数据中获取图集名称，数据结构:', data);

    if (data.collection) {
        if (data.collection.collection_name) {
            console.log('使用data.collection.collection_name字段:', data.collection.collection_name);
            return data.collection.collection_name;
        }
        if (data.collection.name) {
            console.log('使用data.collection.name字段:', data.collection.name);
            return data.collection.name;
        }
    }

    if (data.collection_name) {
        console.log('使用data.collection_name字段:', data.collection_name);
        return data.collection_name;
    }

    if (data.name) {
        console.log('使用data.name字段:', data.name);
        return data.name;
    }

    if (data.images && data.images.length > 0) {
        const firstImage = data.images[0];
        if (firstImage.collection_name) {
            console.log('使用images[0].collection_name字段:', firstImage.collection_name);
            return firstImage.collection_name;
        }
    }

    console.log('未找到图集名称，尝试从API获取');
    fetchCollectionInfo(collectionId);
    return "";
}

// 获取图集信息
function fetchCollectionInfo(id) {
    console.log('发送额外请求获取图集信息:', id);
    
    fetch(`/api/image_collection/${id}`)
        .then(response => response.json())
        .then(data => {
            console.log('获取到图集信息:', data);
            let collectionData = data.data || data;
            
            if (collectionData && collectionData.collection_name) {
                collectionName = collectionData.collection_name;
                console.log('通过额外请求获取到collection_name:', collectionName);
                updatePageTitle();
            } else if (collectionData && collectionData.name) {
                collectionName = collectionData.name;
                console.log('通过额外请求获取到name:', collectionName);
                updatePageTitle();
            } else if (collectionData && collectionData.collection && collectionData.collection.name) {
                collectionName = collectionData.collection.name;
                console.log('通过额外请求获取到collection.name:', collectionName);
                updatePageTitle();
            } else {
                console.log('额外请求未返回有效的图集名称');
            }
        })
        .catch(err => {
            console.error('获取图集信息失败:', err);
        });
}

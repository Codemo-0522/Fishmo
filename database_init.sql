/*
 Navicat MySQL Data Transfer

 Source Server         : root
 Source Server Type    : MySQL
 Source Server Version : 80200
 Source Host           : localhost:3306
 Source Schema         : fishmo

 Target Server Type    : MySQL
 Target Server Version : 80200
 File Encoding         : 65001

 Date: 20/08/2025 17:40:11
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for access_group
-- ----------------------------
DROP TABLE IF EXISTS `access_group`;
CREATE TABLE `access_group`  (
  `group_id` tinyint NOT NULL COMMENT '1-普通组 2-VIP组',
  `group_name` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`group_id`) USING BTREE,
  UNIQUE INDEX `group_name`(`group_name`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of access_group
-- ----------------------------
INSERT INTO `access_group` VALUES (1, 'ordinary_user');
INSERT INTO `access_group` VALUES (2, 'vip_user');

-- ----------------------------
-- Table structure for audio_collection
-- ----------------------------
DROP TABLE IF EXISTS `audio_collection`;
CREATE TABLE `audio_collection`  (
  `collection_id` int NOT NULL AUTO_INCREMENT,
  `disk_id` int NOT NULL,
  `collection_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '专辑/文件夹名称',
  `storage_root` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物理存储根路径',
  `group_id` tinyint NOT NULL COMMENT '访问权限组',
  `cover_path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '专辑封面路径',
  `artist` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '艺术家名称',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `update_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`collection_id`) USING BTREE,
  UNIQUE INDEX `uniq_collection`(`collection_name`) USING BTREE,
  INDEX `idx_group_root`(`group_id`, `storage_root`(100)) USING BTREE,
  INDEX `disk_id`(`disk_id`) USING BTREE,
  CONSTRAINT `audio_collection_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `access_group` (`group_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `audio_collection_ibfk_2` FOREIGN KEY (`disk_id`) REFERENCES `storage_disk` (`disk_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 40 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of audio_collection
-- ----------------------------

-- ----------------------------
-- Table structure for audio_item
-- ----------------------------
DROP TABLE IF EXISTS `audio_item`;
CREATE TABLE `audio_item`  (
  `audio_id` int NOT NULL AUTO_INCREMENT COMMENT '音频自增ID',
  `collection_id` int NOT NULL COMMENT '所属专辑ID',
  `relative_path` varchar(768) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '相对路径（含文件名）',
  `file_size` int UNSIGNED NULL DEFAULT NULL COMMENT '音频文件大小',
  `duration` int UNSIGNED NULL DEFAULT NULL COMMENT '音频时长(秒)',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '音频标题',
  `artist` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '艺术家',
  `album` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '专辑名',
  `genre` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '音乐类型',
  `year` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '发行年份',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '音频插入时间',
  PRIMARY KEY (`audio_id`) USING BTREE,
  UNIQUE INDEX `uniq_file`(`collection_id`, `relative_path`(200)) USING BTREE,
  INDEX `idx_collection`(`collection_id`) USING BTREE,
  CONSTRAINT `audio_item_ibfk_1` FOREIGN KEY (`collection_id`) REFERENCES `audio_collection` (`collection_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1509 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of audio_item
-- ----------------------------

-- ----------------------------
-- Table structure for image_collection
-- ----------------------------
DROP TABLE IF EXISTS `image_collection`;
CREATE TABLE `image_collection`  (
  `collection_id` int NOT NULL AUTO_INCREMENT,
  `disk_id` int NOT NULL,
  `collection_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '套图名称',
  `storage_root` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物理存储根路径',
  `group_id` tinyint NOT NULL COMMENT '访问权限组',
  `cover_id` int NULL DEFAULT NULL COMMENT '封面图片ID (image_item的某张图片的ID，让该图片作为封面图展示)',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `update_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`collection_id`) USING BTREE,
  UNIQUE INDEX `uniq_collection`(`collection_name`) USING BTREE,
  INDEX `idx_group_root`(`group_id`, `storage_root`(100)) USING BTREE,
  INDEX `disk_id`(`disk_id`) USING BTREE,
  CONSTRAINT `image_collection_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `access_group` (`group_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `image_collection_ibfk_2` FOREIGN KEY (`disk_id`) REFERENCES `storage_disk` (`disk_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 109 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of image_collection
-- ----------------------------

-- ----------------------------
-- Table structure for image_item
-- ----------------------------
DROP TABLE IF EXISTS `image_item`;
CREATE TABLE `image_item`  (
  `image_id` bigint UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片自增ID',
  `collection_id` int NOT NULL COMMENT '所属套图ID',
  `relative_path` varchar(768) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '相对路径（含文件名）',
  `file_size` int UNSIGNED NULL DEFAULT NULL COMMENT '图片字节数',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '图片插入时间',
  PRIMARY KEY (`image_id`) USING BTREE,
  UNIQUE INDEX `uniq_file`(`collection_id`, `relative_path`(200)) USING BTREE,
  INDEX `idx_collection`(`collection_id`) USING BTREE,
  CONSTRAINT `image_item_ibfk_1` FOREIGN KEY (`collection_id`) REFERENCES `image_collection` (`collection_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 38419 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of image_item
-- ----------------------------

-- ----------------------------
-- Table structure for storage_disk
-- ----------------------------
DROP TABLE IF EXISTS `storage_disk`;
CREATE TABLE `storage_disk`  (
  `disk_id` int NOT NULL AUTO_INCREMENT COMMENT '不同的盘符自增ID',
  `disk_drive` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '盘符（C/D/E等）',
  `mount_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '挂载路径（兼容Linux/Windows）（父路径）',
  `is_active` tinyint(1) NULL DEFAULT 1 COMMENT '标记磁盘可用状态',
  PRIMARY KEY (`disk_id`) USING BTREE,
  UNIQUE INDEX `uniq_disk`(`disk_drive`, `mount_path`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 76 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of storage_disk
-- ----------------------------

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_account` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户账号',
  `user_password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户密码',
  `user_role` enum('admin','user') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'user' COMMENT '用户角色',
  `user_group` int NULL DEFAULT 1 COMMENT '用户分组  普通用户/VIP用户',
  `create_time` datetime(0) NULL DEFAULT CURRENT_TIMESTAMP(0) COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `user_account`(`user_account`) USING BTREE,
  INDEX `idx_account`(`user_account`) USING BTREE,
  INDEX `idx_role`(`user_role`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES (1, 'admin', '123456', 'admin', 2, '2025-04-09 19:43:50');
INSERT INTO `users` VALUES (2, 'user', '123456', 'user', 1, '2025-04-10 02:45:56');
INSERT INTO `users` VALUES (4, 'vip_user', '123456', 'user', 2, '2025-05-01 22:48:29');

-- ----------------------------
-- Table structure for video_collection
-- ----------------------------
DROP TABLE IF EXISTS `video_collection`;
CREATE TABLE `video_collection`  (
  `collection_id` int NOT NULL AUTO_INCREMENT,
  `disk_id` int NOT NULL COMMENT '关联的磁盘ID',
  `collection_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '视频分类/文件夹名称',
  `storage_root` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物理存储根路径（相对于磁盘挂载点）',
  `group_id` tinyint NOT NULL DEFAULT 1 COMMENT '访问权限组 (1=普通, 2=VIP)',
  `cover_video_id` int NULL DEFAULT NULL COMMENT '封面视频ID (video_item的某个视频ID)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '分类描述',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `update_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `thumbnail_disk_id` int NULL DEFAULT NULL COMMENT '缩略图磁盘ID',
  `thumbnail_root` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '缩略图根路径（相对于缩略图磁盘挂载点）',
  PRIMARY KEY (`collection_id`) USING BTREE,
  UNIQUE INDEX `uniq_collection`(`collection_name`, `disk_id`) USING BTREE,
  INDEX `idx_group_root`(`group_id`, `storage_root`(100)) USING BTREE,
  INDEX `disk_id`(`disk_id`) USING BTREE,
  INDEX `video_collection_thumbnail_fk`(`thumbnail_disk_id`) USING BTREE,
  CONSTRAINT `video_collection_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `access_group` (`group_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `video_collection_ibfk_2` FOREIGN KEY (`disk_id`) REFERENCES `storage_disk` (`disk_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `video_collection_thumbnail_fk` FOREIGN KEY (`thumbnail_disk_id`) REFERENCES `storage_disk` (`disk_id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of video_collection
-- ----------------------------

-- ----------------------------
-- Table structure for video_item
-- ----------------------------
DROP TABLE IF EXISTS `video_item`;
CREATE TABLE `video_item`  (
  `video_id` int NOT NULL AUTO_INCREMENT COMMENT '视频自增ID',
  `collection_id` int NOT NULL COMMENT '所属视频集合ID',
  `relative_path` varchar(768) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '相对路径（含文件名）',
  `video_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '视频文件名',
  `file_size` bigint UNSIGNED NULL DEFAULT NULL COMMENT '视频文件大小(字节)',
  `video_duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '视频时长',
  `video_quality` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '视频画质标签',
  `video_width` int NULL DEFAULT NULL COMMENT '视频宽度',
  `video_height` int NULL DEFAULT NULL COMMENT '视频高度',
  `video_bitrate` int NULL DEFAULT NULL COMMENT '视频比特率',
  `video_fps` decimal(8, 3) NULL DEFAULT NULL COMMENT '视频帧率',
  `video_codec` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '视频编码格式',
  `thumbnail_path` varchar(768) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '缩略图相对路径',
  `create_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '视频插入时间',
  `update_time` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`video_id`) USING BTREE,
  UNIQUE INDEX `uniq_file`(`collection_id`, `relative_path`(200)) USING BTREE,
  INDEX `idx_collection`(`collection_id`) USING BTREE,
  INDEX `idx_quality`(`video_quality`) USING BTREE,
  INDEX `idx_duration`(`video_duration`) USING BTREE,
  CONSTRAINT `video_item_ibfk_1` FOREIGN KEY (`collection_id`) REFERENCES `video_collection` (`collection_id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of video_item
-- ----------------------------

SET FOREIGN_KEY_CHECKS = 1;

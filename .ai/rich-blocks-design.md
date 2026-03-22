# Rich Blocks 设计文档

## 目标
让 Visual Talk 覆盖日常生活场景：电影推荐、餐厅探店、旅行规划、读书笔记。

## 新增 Block 类型

### 1. `poi` — 地点/商户卡片（大众点评、Google Maps）
```json
{
  "type": "poi",
  "key": "great-wall",
  "name": "八达岭长城",
  "address": "北京延庆区",
  "rating": 4.5,
  "priceLevel": "$$",
  "category": "景点",
  "tags": ["世界遗产", "户外"],
  "image": "url",
  "lat": 40.4319,
  "lng": 116.5704,
  "source": "dianping",
  "sourceUrl": "https://..."
}
```

### 2. `movie` — 电影/剧集卡片（TMDB/OMDB/豆瓣）
```json
{
  "type": "movie",
  "key": "interstellar",
  "title": "星际穿越",
  "originalTitle": "Interstellar",
  "year": 2014,
  "director": "Christopher Nolan",
  "rating": 9.4,
  "ratingSource": "douban",
  "poster": "tmdb-poster-url",
  "genres": ["科幻", "冒险"],
  "runtime": 169,
  "overview": "一句话简介",
  "cast": ["Matthew McConaughey", "Anne Hathaway"]
}
```

### 3. `map` — 地图视图（标记 + 路线）
```json
{
  "type": "map",
  "key": "beijing-trip",
  "center": [39.9042, 116.4074],
  "zoom": 12,
  "markers": [
    {"lat": 39.9, "lng": 116.4, "label": "天安门", "color": "#e8a849"},
    {"lat": 40.4, "lng": 116.5, "label": "长城", "color": "#7ec8a4"}
  ],
  "route": [
    [39.9, 116.4],
    [40.0, 116.3],
    [40.4, 116.5]
  ],
  "routeColor": "#8bacd4",
  "style": "dark"
}
```

### 4. `review` — 点评/笔记卡片（小红书、大众点评）
```json
{
  "type": "review",
  "key": "cafe-review",
  "title": "超赞的精品咖啡",
  "author": "小红薯123",
  "source": "xiaohongshu",
  "rating": 4.8,
  "content": "正文摘要...",
  "images": ["url1", "url2"],
  "tags": ["咖啡", "打卡"],
  "likes": 2340,
  "date": "2024-03-15"
}
```

## 数据获取架构

### 方案讨论：谁来获取数据？

#### 方案 A：LLM 自带知识 + Tool Call 补充
- LLM 直接输出电影/地点信息（基于训练数据）
- 海报、评分等实时数据通过 tool call 获取
- 优点：简单，不需要后端
- 缺点：LLM 知识可能过时，海报 URL 会幻觉

#### 方案 B：前端 API 直连
- 前端直接调 TMDB/OMDB API（这些有 CORS 支持）
- 大众点评/豆瓣/小红书没有公开 API
- 优点：实时数据，无后端
- 缺点：API key 暴露在前端，部分数据源无法访问

#### 方案 C：LLM Tool + Tavily 搜索增强
- 给 LLM 加 tool：search_movie、search_poi、search_review
- tool 实现用 Tavily 搜索获取结构化数据
- 优点：统一接口，利用现有 Tavily 配置
- 缺点：Tavily 结果需要解析

#### 方案 D：Proxy 中转（companion-ui 模式）
- 前端调 proxy API，proxy 调各平台
- 优点：能访问任何平台，API key 安全
- 缺点：需要维护后端

### 建议

**第一阶段：方案 A + TMDB 直连**
- 电影：TMDB API（免费，CORS 友好，海报可靠）
- 地点/评分：LLM 知识 + Tavily 搜索补充
- 地图：Leaflet/MapLibre（纯前端，免费瓦片）

**第二阶段：方案 C**
- 给 LLM 加 tool call 能力
- search_movie → TMDB API
- search_poi → Tavily + 结构化解析

## 地图技术选型

| 选项 | 免费 | 暗色主题 | 离线 | 中国地图 |
|------|------|---------|------|---------|
| Leaflet + OSM | ✓ | 需要暗色瓦片 | ✗ | ✓ |
| MapLibre GL | ✓ | ✓ (style) | ✗ | ✓ |
| 高德地图 JS | ✓ (有限) | ✓ | ✗ | ✓✓ |

**建议：MapLibre GL + 免费暗色瓦片**
- 体积小，矢量渲染
- 暗色主题完美匹配 Visual Talk 风格
- 标记和路线都是原生支持

## 实现优先级

1. **movie block** — 最常用，TMDB API 成熟
2. **map block** — 视觉冲击力强，MapLibre 集成简单
3. **poi block** — 复用 card block 结构 + 地图关联
4. **review block** — 需要内容抓取，优先级靠后

## 开放问题

- [ ] TMDB API key 放前端还是走 proxy？
- [ ] 地图瓦片源选择（CartoDB dark_matter？Stadia dark？）
- [ ] 豆瓣/大众点评数据怎么获取？
- [ ] 小红书内容是否有版权风险？
- [ ] map block 跟 poi block 的关联（点击 poi 跳到地图？）

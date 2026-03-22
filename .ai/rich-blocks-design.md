# Rich Blocks 设计文档 v2

## 核心洞察
**重点是数据源，不是 block。Block 要尽可能通用。**

现有 block 已经能表达几乎所有场景：
- 电影推荐 → `card` (poster=image, title, sub=导演, tags=类型, items=亮点, footer=评分)
- 餐厅 → `card` (image, title, sub=地址, tags=标签, items=推荐菜, footer=人均)
- 书评 → `card` + `callout` (引用)
- 数据对比 → `chart` + `metric`

**唯一需要新 block 的：`map`** — 地图渲染是新能力。

## 架构：Data Source Tools

### Tool Call 流程
```
用户: "推荐三部科幻电影"
  ↓
LLM 判断需要真实数据 → tool_call: search_movie("科幻", limit=3)
  ↓
前端执行 tool → TMDB API → 返回结构化数据
  ↓
LLM 用真实数据组装 card blocks（海报 URL 真实、评分准确）
```

### Tool 列表

| Tool | 数据源 | 返回 | 用途 |
|------|--------|------|------|
| `search_movie` | TMDB API | title, poster, rating, year, genres, overview, cast | 电影/剧集推荐 |
| `search_book` | Open Library / Google Books | title, cover, author, rating, isbn | 书籍推荐 |
| `search_place` | Tavily + 结构化解析 | name, address, rating, lat/lng, image | 餐厅/景点 |
| `search_web` | Tavily (已有) | snippets, urls | 通用搜索 |

### 为什么 Tool Call 而不是前端直连？
- **LLM 决定何时调用** — 不是每次都需要搜索
- **LLM 组装结果** — 决定展示哪些信息、怎么排版
- **数据源可替换** — 换 API 不影响 block 层
- **已有 Tavily 验证** — tool call 管道已经跑通

## 新增 Block：map

唯一真正需要的新 block。

```json
{
  "type": "map",
  "key": "trip-route",
  "title": "北京一日游路线",
  "center": [39.9042, 116.4074],
  "zoom": 12,
  "markers": [
    {"lat": 39.9, "lng": 116.4, "label": "天安门", "icon": "pin"},
    {"lat": 40.4, "lng": 116.5, "label": "长城", "icon": "pin"}
  ],
  "route": [[39.9, 116.4], [40.0, 116.3], [40.4, 116.5]],
  "style": "dark"
}
```

技术：MapLibre GL JS + 免费暗色矢量瓦片

## 实现计划

### Phase 1: Tool Call 基础设施
1. 前端 tool executor（接收 LLM tool_call，执行对应函数，返回结果）
2. system prompt 增加 tool 定义
3. TMDB tool 实现（验证管道）

### Phase 2: 数据源扩展
4. search_book (Open Library)
5. search_place (Tavily 结构化)
6. map block + MapLibre 集成

### Phase 3: 中国特色数据源
7. 豆瓣评分（Tavily 搜索 + 解析）
8. 大众点评信息（Tavily 搜索 + 解析）
9. 小红书内容（需要评估可行性）

## 开放问题
- [ ] TMDB API key：前端 localStorage 配置 vs proxy
- [ ] 地图瓦片：CartoDB dark_matter (免费) vs 高德 (中国准)
- [ ] Tool call 的 Anthropic 协议格式确认
- [ ] 大众点评/豆瓣无 API，Tavily 搜索能拿到多少结构化数据？

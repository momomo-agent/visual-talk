# agentic-claw Skills 架构思考

## 现状
- agentic-core: `customTools` 数组，每个 tool 有 `{ name, description, parameters, execute }`
- agentic-claw: 在 `createClaw()` 时传入 `tools` 数组
- Visual Talk: 在 `useLLM.js` 里硬编码 `web_search` tool

## 问题
- Tool 定义硬编码在应用层
- 不同产品（Visual Talk、Companion UI、MoltTalk）各自实现相同的 tool
- 没有发现/注册机制

## 目标
agentic-claw 支持 skill 注册，让 tool 可以跨产品复用。

## Skill 格式
```js
// tmdb.skill.js
export default {
  name: 'tmdb',
  displayName: 'TMDB Movie Search',
  description: 'Search movies, TV shows, and people via TMDB API',
  
  // Configuration schema (shown in settings)
  config: {
    apiKey: { type: 'string', label: 'TMDB API Key', required: true },
  },
  
  // Tools provided by this skill
  tools: [
    {
      name: 'search_movie',
      description: 'Search for movies by title, genre, or keyword. Returns structured data including poster URLs, ratings, cast, and overview.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Movie search query' },
          year: { type: 'number', description: 'Filter by release year' },
          language: { type: 'string', description: 'Language code (default: zh-CN)' },
        },
        required: ['query'],
      },
      execute: async (input, config) => {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${config.apiKey}&query=${encodeURIComponent(input.query)}&language=${input.language || 'zh-CN'}`
        )
        const data = await res.json()
        return {
          results: (data.results || []).slice(0, 5).map(m => ({
            title: m.title,
            originalTitle: m.original_title,
            year: m.release_date?.slice(0, 4),
            overview: m.overview,
            rating: m.vote_average,
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            genres: m.genre_ids, // would need genre map
          }))
        }
      }
    },
    {
      name: 'get_movie_detail',
      description: 'Get detailed info about a specific movie by TMDB ID',
      parameters: {
        type: 'object',
        properties: {
          movie_id: { type: 'number', description: 'TMDB movie ID' },
        },
        required: ['movie_id'],
      },
      execute: async (input, config) => {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${input.movie_id}?api_key=${config.apiKey}&language=zh-CN&append_to_response=credits`
        )
        const m = await res.json()
        return {
          title: m.title,
          originalTitle: m.original_title,
          year: m.release_date?.slice(0, 4),
          runtime: m.runtime,
          genres: m.genres?.map(g => g.name),
          overview: m.overview,
          rating: m.vote_average,
          poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          director: m.credits?.crew?.find(c => c.job === 'Director')?.name,
          cast: m.credits?.cast?.slice(0, 5).map(c => c.name),
        }
      }
    }
  ]
}
```

## agentic-claw 需要的改动

```js
const claw = createClaw({
  apiKey: '...',
  skills: [tmdbSkill, tavilySkill, mapSkill],  // ← NEW
  skillConfig: {  // ← NEW: per-skill config
    tmdb: { apiKey: 'tmdb-key-here' },
    tavily: { apiKey: 'tavily-key-here' },
  },
})
```

claw 内部：
1. 展开所有 skill.tools 到 customTools
2. 每个 tool.execute 调用时注入对应 skill 的 config
3. skill config 可以动态更新（用户在设置里改）

## Visual Talk 的改动

```js
import tmdbSkill from './skills/tmdb.skill.js'
import mapSkill from './skills/map.skill.js'

claw = AgenticClaw.createClaw({
  // ...existing config
  skills: [tmdbSkill, mapSkill],
  skillConfig: {
    tmdb: { apiKey: cfg.tmdbKey },
  },
  tools: [
    // 仍然支持 inline tools（向后兼容）
    { name: 'web_search', ... }
  ],
})
```

## 跨产品复用

```
@momomo-agent/skill-tmdb      → 电影搜索
@momomo-agent/skill-tavily    → Web 搜索  
@momomo-agent/skill-maps      → 地图/地点
@momomo-agent/skill-books     → 书籍搜索
```

任何基于 agentic-claw 的产品直接 import skill，不用重写。

## 优先级
1. 先在 Visual Talk 里硬编码 TMDB tool 验证管道
2. 验证后提取成 skill 格式
3. 升级 agentic-claw 支持 skills API
4. 其他产品复用

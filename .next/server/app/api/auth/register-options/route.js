(()=>{var a={};a.id=949,a.ids=[949],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},615:(a,b,c)=>{"use strict";c.d(b,{Ve:()=>z,as:()=>o,VZ:()=>u,Xu:()=>E,py:()=>i,Ay:()=>I,V8:()=>s,_R:()=>y,I7:()=>G,Ys:()=>l,mn:()=>C,z1:()=>D,Es:()=>p,bi:()=>q,nP:()=>v,Sm:()=>w,Ji:()=>B,nB:()=>F,Nr:()=>j,Ps:()=>m,B:()=>H,hv:()=>A,pC:()=>n,lb:()=>r,Gw:()=>x,uy:()=>k});let d=require("better-sqlite3");var e=c.n(d),f=c(3873),g=c.n(f);let h=new(e())(g().join(process.cwd(),"todos.db"));function i(a,b,c,d="medium"){return j(h.prepare(`
    INSERT INTO todos (user_id, title, due_date, priority)
    VALUES (?, ?, ?, ?)
  `).run(a,b,c,d).lastInsertRowid)}function j(a){return h.prepare("SELECT * FROM todos WHERE id = ?").get(a)}function k(a,b){let c=[],d=[];return void 0!==b.title&&(c.push("title = ?"),d.push(b.title)),void 0!==b.due_date&&(c.push("due_date = ?"),d.push(b.due_date)),void 0!==b.priority&&(c.push("priority = ?"),d.push(b.priority)),void 0!==b.completed&&(c.push("completed = ?"),d.push(b.completed),1===b.completed?(c.push("completed_at = ?"),d.push(new Date().toISOString())):c.push("completed_at = NULL")),0===c.length||(d.push(a),h.prepare(`
    UPDATE todos 
    SET ${c.join(", ")}
    WHERE id = ?
  `).run(...d)),j(a)}function l(a){return h.prepare("DELETE FROM todos WHERE id = ?").run(a).changes>0}function m(a){return h.prepare(`
    SELECT * FROM todos 
    WHERE user_id = ? 
      AND completed = 0 
      AND reminder_minutes IS NOT NULL
      AND (
        last_notification_sent IS NULL 
        OR datetime(last_notification_sent) < datetime('now', '-1 hour')
      )
    ORDER BY due_date ASC
  `).all(a)}function n(a){h.prepare(`
    UPDATE todos 
    SET last_notification_sent = datetime('now')
    WHERE id = ?
  `).run(a)}function o(a,b){let c=(h.prepare("SELECT MAX(position) as maxPos FROM subtasks WHERE todo_id = ?").get(a).maxPos??-1)+1;return p(h.prepare(`
    INSERT INTO subtasks (todo_id, title, position)
    VALUES (?, ?, ?)
  `).run(a,b,c).lastInsertRowid)}function p(a){return h.prepare("SELECT * FROM subtasks WHERE id = ?").get(a)}function q(a){return h.prepare("SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC").all(a)}function r(a,b){let c=[],d=[];return void 0!==b.title&&(c.push("title = ?"),d.push(b.title)),void 0!==b.completed&&(c.push("completed = ?"),d.push(b.completed)),void 0!==b.position&&(c.push("position = ?"),d.push(b.position)),0===c.length||(d.push(a),h.prepare(`UPDATE subtasks SET ${c.join(", ")} WHERE id = ?`).run(...d)),p(a)}function s(a){return h.prepare("DELETE FROM subtasks WHERE id = ?").run(a).changes>0}h.pragma("foreign_keys = ON"),h.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      position INTEGER NOT NULL,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (todo_id, tag_id),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      due_date_offset INTEGER DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      subtasks_json TEXT,
      tag_ids_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
    CREATE INDEX IF NOT EXISTS idx_authenticators_credential_id ON authenticators(credential_id);
  `);let t=["#EF4444","#F59E0B","#10B981","#3B82F6","#6366F1","#8B5CF6","#EC4899","#14B8A6","#F97316","#84CC16"];function u(a,b,c){let d=c||t[Math.floor(Math.random()*t.length)];return v(h.prepare(`
    INSERT INTO tags (user_id, name, color)
    VALUES (?, ?, ?)
  `).run(a,b,d).lastInsertRowid)}function v(a){return h.prepare("SELECT * FROM tags WHERE id = ?").get(a)}function w(a){return h.prepare("SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC").all(a)}function x(a,b){let c=[],d=[];return void 0!==b.name&&(c.push("name = ?"),d.push(b.name)),void 0!==b.color&&(c.push("color = ?"),d.push(b.color)),0===c.length||(d.push(a),h.prepare(`UPDATE tags SET ${c.join(", ")} WHERE id = ?`).run(...d)),v(a)}function y(a){return h.prepare("DELETE FROM tags WHERE id = ?").run(a).changes>0}function z(a,b){h.prepare(`
    INSERT OR IGNORE INTO todo_tags (todo_id, tag_id)
    VALUES (?, ?)
  `).run(a,b)}function A(a,b){h.prepare("DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?").run(a,b)}function B(a){return h.prepare(`
    SELECT t.* FROM tags t
    JOIN todo_tags tt ON t.id = tt.tag_id
    WHERE tt.todo_id = ?
    ORDER BY t.name ASC
  `).all(a)}function C(a){return h.prepare(`
    SELECT * FROM todos 
    WHERE user_id = ? 
    ORDER BY completed ASC, due_date ASC
  `).all(a).map(a=>({...a,subtasks:q(a.id)||[],tags:B(a.id)||[]}))}function D(a="demo-user"){let b=h.prepare("SELECT id, username FROM users WHERE username = ?"),c=b.get(a);return c||(c={id:(b=h.prepare("INSERT INTO users (username) VALUES (?)")).run(a).lastInsertRowid,username:a}),c}function E(a,b,c,d,e,f,g){return h.prepare(`
    INSERT INTO templates (user_id, name, category, due_date_offset, priority, subtasks_json, tag_ids_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(a,b,c,d,e,f,g).lastInsertRowid}function F(a){return h.prepare("SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC").all(a)}function G(a){h.prepare("DELETE FROM templates WHERE id = ?").run(a)}function H(a,b,c){let d=h.prepare("SELECT * FROM templates WHERE id = ?").get(a);if(!d)throw Error("Template not found");let e=i(b,`Todo from ${d.name}`,c,d.priority).id;if(d.subtasks_json)try{for(let a of JSON.parse(d.subtasks_json))o(e,a.title)}catch(a){console.error("Failed to parse subtasks JSON:",a)}if(d.tag_ids_json)try{for(let a of JSON.parse(d.tag_ids_json))z(e,a)}catch(a){console.error("Failed to parse tag IDs JSON:",a)}return e}let I=h},846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},1630:a=>{"use strict";a.exports=require("http")},1777:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>F,patchFetch:()=>E,routeModule:()=>A,serverHooks:()=>D,workAsyncStorage:()=>B,workUnitAsyncStorage:()=>C});var d={};c.r(d),c.d(d,{POST:()=>z});var e=c(5736),f=c(9117),g=c(4044),h=c(9326),i=c(2324),j=c(261),k=c(4290),l=c(5328),m=c(8928),n=c(6595),o=c(3421),p=c(7679),q=c(1681),r=c(3446),s=c(6439),t=c(1356),u=c(641),v=c(5242),w=c(6542),x=c(4499);let y=process.env.RP_NAME||"Todo App";async function z(a){try{let b,{username:c}=await a.json(),d=a.headers.get("host")||"localhost",e=process.env.RP_ID||d.split(":")[0];if(!c||"string"!=typeof c)return u.NextResponse.json({error:"Username required"},{status:400});let f=(0,w.JE)(c);b=f?f.id:await (0,w.kg)(c,"webauthn-temp-"+Math.random().toString(36));let g=await (0,v.DW)({rpName:y,rpID:e,userName:c,userID:new Uint8Array(Buffer.from(b.toString())),attestationType:"none",authenticatorSelection:{residentKey:"preferred",userVerification:"preferred"},timeout:6e4});return x.d.set(c,g.challenge),u.NextResponse.json(g)}catch(a){return console.error("Error generating registration options:",a),u.NextResponse.json({error:"Failed to generate options"},{status:500})}}let A=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/auth/register-options/route",pathname:"/api/auth/register-options",filename:"route",bundlePath:"app/api/auth/register-options/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"C:\\Users\\dy\\Desktop\\githubcopilot\\NUS-ISS-AI-SDLC-Group1-ToDoApp\\app\\api\\auth\\register-options\\route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:B,workUnitAsyncStorage:C,serverHooks:D}=A;function E(){return(0,g.patchFetch)({workAsyncStorage:B,workUnitAsyncStorage:C})}async function F(a,b,c){var d;let e="/api/auth/register-options/route";"/index"===e&&(e="/");let g=await A.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[D]);if(F&&!x){let a=!!y.routes[D],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||A.isDev||x||(G="/index"===(G=D)?"/":G);let H=!0===A.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>A.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>A.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await A.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})},z),b}},l=await A.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await A.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},1997:a=>{"use strict";a.exports=require("punycode")},3033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},3873:a=>{"use strict";a.exports=require("path")},4075:a=>{"use strict";a.exports=require("zlib")},4499:(a,b,c)=>{"use strict";c.d(b,{U:()=>e,d:()=>d});let d=new Map,e=new Map},4573:a=>{"use strict";a.exports=require("node:buffer")},4708:a=>{"use strict";a.exports=require("node:https")},4870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5591:a=>{"use strict";a.exports=require("https")},6439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},6487:()=>{},6542:(a,b,c)=>{"use strict";c.d(b,{jw:()=>j,kg:()=>n,ME:()=>l,h$:()=>r,Gu:()=>q,Ht:()=>k,JE:()=>m,Bd:()=>p,bz:()=>s,BE:()=>o});var d=c(9594),e=c(6802);let f=require("bcrypt");var g=c.n(f),h=c(615);let i=new TextEncoder().encode(process.env.JWT_SECRET||"your-secret-key-min-32-characters-long-please-change-this");async function j(a,b){let c=await new d.Pl({userId:a,username:b}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("7d").sign(i);(await (0,e.UL)()).set("session",c,{httpOnly:!0,secure:!0,sameSite:"lax",maxAge:604800,path:"/"})}async function k(){let a=(await (0,e.UL)()).get("session");if(!a)return null;try{let{payload:b}=await (0,d.Vv)(a.value,i);if("number"==typeof b.userId&&"string"==typeof b.username)return{userId:b.userId,username:b.username};return null}catch(a){return null}}async function l(){(await (0,e.UL)()).delete("session")}function m(a){return h.Ay.prepare("SELECT * FROM users WHERE username = ?").get(a)}async function n(a,b){let c=await g().hash(b,10);return h.Ay.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(a,c).lastInsertRowid}async function o(a,b){let c=m(a);return!!c&&!!c.password_hash&&await g().compare(b,c.password_hash)}function p(a,b,c,d,e){let f=e?JSON.stringify(e):null;h.Ay.prepare(`
    INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, transports)
    VALUES (?, ?, ?, ?, ?)
  `).run(a,b,c,d,f)}function q(a){return h.Ay.prepare("SELECT * FROM authenticators WHERE user_id = ?").all(a)}function r(a){return h.Ay.prepare("SELECT * FROM authenticators WHERE credential_id = ?").get(a)}function s(a,b){h.Ay.prepare("UPDATE authenticators SET counter = ? WHERE credential_id = ?").run(b,a)}},7067:a=>{"use strict";a.exports=require("node:http")},7598:a=>{"use strict";a.exports=require("node:crypto")},7910:a=>{"use strict";a.exports=require("stream")},7975:a=>{"use strict";a.exports=require("node:util")},8335:()=>{},8474:a=>{"use strict";a.exports=require("node:events")},9121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},9294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},9551:a=>{"use strict";a.exports=require("url")}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[331,692,309,242],()=>b(b.s=1777));module.exports=c})();
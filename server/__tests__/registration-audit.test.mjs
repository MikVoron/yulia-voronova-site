import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const Module = require('module');
const src = path.resolve(import.meta.dirname, '../src');
const query = vi.fn();
function mock(file, exports) {
  const resolved = require.resolve(path.join(src,file));
  const module = new Module(resolved);
  module.exports = exports; module.loaded = true; require.cache[resolved] = module;
}
mock('db.js',{query});
mock('middleware.js',{requireAdmin:async req=>{req.user={sub:'admin-fixture'};}});
mock('email.js',{});
mock('audit.js',{});
let app;
beforeAll(async()=>{
  app=require('fastify')({logger:false});
  await app.register(require('../src/routes/admin'));
  await app.ready();
});
afterAll(async()=>app.close());
beforeEach(()=>query.mockReset());
describe('registration audit API filters',()=>{
  it.each(['auth_code_sent','auth_code_send_failed','auth_code_rejected'])('accepts %s with parameterized pagination',async event=>{
    query.mockResolvedValueOnce({rows:[{count:'1'}]}).mockResolvedValueOnce({rows:[{id:1,event,email:'pending@example.com'}]});
    const response=await app.inject('/admin/audit?event='+event);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({total:1,hasMore:false,rows:[{event,email:'pending@example.com'}]});
    expect(query.mock.calls[0][1]).toEqual([event,50,0]);
    expect(query.mock.calls[1][1]).toEqual([event,50,0]);
  });
  it('paginates the current incomplete-registration view using its full server-side count',async()=>{
    query.mockResolvedValueOnce({rows:[{count:'102'}]}).mockResolvedValueOnce({rows:[{id:52,email:'pending@example.com'}]});
    const response=await app.inject('/admin/audit?event=registration_incomplete&page=2&limit=50');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({total:102,page:2,limit:50,hasMore:true});
    expect(query.mock.calls[1][1]).toEqual([50,50]);
    expect(query.mock.calls[1][0]).not.toContain("event='registration_incomplete'");
  });
  it('returns an empty view and rejects unsupported events without querying',async()=>{
    query.mockResolvedValueOnce({rows:[{count:'0'}]}).mockResolvedValueOnce({rows:[]});
    expect((await app.inject('/admin/audit?event=registration_incomplete')).json()).toMatchObject({total:0,rows:[],hasMore:false});
    query.mockClear();
    expect((await app.inject('/admin/audit?event=auth_code_sent%27%20OR%20true')).statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

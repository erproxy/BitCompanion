import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateStore} from '../web/state-storage.js';

function storageFixture() {
  const data=new Map();
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
test('a stale tab cannot overwrite newer saves or imports',()=>{
  const storage=storageFixture();
  const first=createStateStore(()=>storage,'state'),second=createStateStore(()=>storage,'state');
  first.read();second.read();
  first.write('{"version":1,"plan":"new"}');
  assert.throws(()=>second.write('old'),{code:'STATE_CHANGED'});
  assert.throws(()=>second.importValue('import','old'),{code:'STATE_CHANGED'});
  assert.equal(storage.data.get('state'),'{'+'"version":1,"plan":"new"}');
  second.read();second.importValue('import','old');
  assert.equal(storage.data.get('state-before-import'),'{"version":1,"plan":"new"}');
  assert.equal(first.read(),'import');
});
test('quota failure during import preserves current state and its backup',()=>{
  const storage=storageFixture();storage.setItem('state','original');
  const store=createStateStore(()=>storage,'state');store.read();
  const set=storage.setItem;
  storage.setItem=(key,value)=>{if(key==='state')throw new Error('Quota exceeded');set(key,value);};
  assert.throws(()=>store.importValue('replacement','original'),/Quota/);
  assert.equal(storage.getItem('state'),'original');
  assert.equal(storage.getItem('state-before-import'),'original');
});

test('simultaneous tabs serialize check-and-write and reject a losing stale snapshot',async()=>{
  const storage=storageFixture();let queue=Promise.resolve();
  const locks={request:(name,action)=>{const operation=queue.then(()=>action());queue=operation.catch(()=>{});return operation;}};
  const first=createStateStore(()=>storage,'state',()=>locks),second=createStateStore(()=>storage,'state',()=>locks);
  first.read();second.read();
  const results=await Promise.allSettled([first.writeLocked('first'),second.importValueLocked('second','old')]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].status,'rejected');
  assert.equal(results[1].reason.code,'STATE_CHANGED');
  assert.equal(storage.getItem('state'),'first');
  assert.equal(storage.getItem('state-before-import'),null);
});

test('reloading current state invalidates already queued writes of the previous copy',async()=>{
  const storage=storageFixture(),store=createStateStore(()=>storage,'state');store.read();
  const oldWrite=store.writeLocked('stale');
  storage.setItem('state','new');store.read();
  await assert.rejects(oldWrite,{code:'STATE_CHANGED'});
  assert.equal(storage.getItem('state'),'new');
});

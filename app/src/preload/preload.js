/* preload.js — the only bridge between the UI and the main process (window.api). */
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (ch) => async (...args) => { const r = await ipcRenderer.invoke(ch, ...args); if (!r.ok) throw new Error(r.error); return r.data; };
contextBridge.exposeInMainWorld('api', {
  app: { info: call('app:info'), chooseFolder: call('app:chooseFolder'), setup: call('app:setup'), moveData: call('app:moveData'),
    openDataFolder: call('app:openDataFolder'), setDevMode: call('app:setDevMode'), publisherKeys: call('app:publisherKeys'),
    choosePublisherKey: call('app:choosePublisherKey'), addPublisherKey: call('app:addPublisherKey'), removePublisherKey: call('app:removePublisherKey'),
    openExternal: call('app:openExternal'), savePdf: call('app:savePdf') },
  auth: { exists: call('auth:exists'), register: call('auth:register'), login: call('auth:login'), logout: call('auth:logout'),
    lastUser: call('auth:lastUser'), changePassword: call('auth:changePassword'), updateName: call('auth:updateName') },
  packs: { list: call('packs:list'), get: call('packs:get'), choose: call('packs:choose'), inspect: call('packs:inspect'),
    install: call('packs:install'), remove: call('packs:remove'), pending: call('packs:pending'),
    unlock: call('packs:unlock'), openFile: call('packs:openFile'),
    exportPackage: call('packs:exportPackage'), exportItem: call('packs:exportItem') },
  progress: { get: call('progress:get'), set: call('progress:set'), reset: call('progress:reset'), export: call('progress:export') },
  enroll: { set: call('enroll:set'), remove: call('enroll:remove') },
  plan: { pack: call('plan:pack'), project: call('plan:project'), calendar: call('plan:calendar'), today: call('plan:today') },
  projects: { list: call('projects:list') },
  certs: { document: call('certs:document'), list: call('certs:list') },
  mine: { add: call('mine:add'), removalInfo: call('mine:removalInfo'), remove: call('mine:remove') },
  groups: { list: call('groups:list'), save: call('groups:save'), remove: call('groups:delete'), setForPack: call('groups:setForPack') },
  catalog: { sources: call('catalog:sources'), addFolder: call('catalog:addFolder'), addFolderPath: call('catalog:addFolderPath'), addUrl: call('catalog:addUrl'),
    remove: call('catalog:remove'), list: call('catalog:list'), fetch: call('catalog:fetch') },
  pathForFile: (file) => webUtils.getPathForFile(file),
  onOpenPack: (cb) => ipcRenderer.on('open-pack', (e, file) => cb(file))
});

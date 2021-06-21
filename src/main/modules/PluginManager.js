import { FormatName, GetPath } from '@/modules/Utils';

import Application from '@/Application';
import BasePlugin from '@/modules/BasePlugin';
import BaseProvider from '@/modules/Downloader/Providers/BaseProvider';
import Download from '@/modules/Download';
import DownloadAdapter from '@/modules/Downloader/DownloadAdapter';
import EventEmitter from 'events';
import NotificationManager from '@/modules/NotificationManager';
import Request from '@/modules/Request';
import RequestHeadersOverrider from '@/modules/RequestHeadersOverrider';
import ResponseHeadersOverrider from '@/modules/ResponseHeadersOverrider';
import WorkDownloader from '@/modules/Downloader/WorkDownloader';
import { debug } from '@/global';
import fs from 'fs-extra';
import md5 from 'md5';
import { parse } from 'node-html-parser';
import path from 'path';

class PluginManager extends EventEmitter {
  /**
   * @type {PluginManager}
   */
  static instance = null;

  /**
   * @constructor
   */
  constructor(app) {
    super();

    /**
     * @type {Application}
     */
    this.app = app;

    /**
     * @type {Map<string, BasePlugin>}
     */
    this.plugins = new Map();

    /**
     * @type {Map<String, String>}
     */
    this.pluginEntries = new Map();

    /**
     * @type {String}
     */
    this.pluginPath = path.join(GetPath.installation(), 'plugins');

    /**
     * @type {NotificationManager}
     */
    this.notificationManager = NotificationManager.getDefault();

    this.initial();
  }

  /**
   * @param {Application} [app]
   * @returns PluginManager
   */
  static getDefault(app) {
    if (PluginManager.instance === null) {
      PluginManager.instance = new PluginManager(app);
    }

    return PluginManager.instance;
  }

  /**
   * @returns void
   */
  initial() {
    this.initalPlugins();
  }

  /**
   * @returns void
   */
  initalPlugins() {
    if (fs.pathExistsSync(this.pluginPath)) {
      let files = fs.readdirSync(this.pluginPath);

      files.forEach(file => {
        this.loadPlugin(path.join(this.pluginPath, file));
      });
    }
  }

  /**
   * Load plugin from entry point
   * @param {String} entry
   */
  loadPlugin(entry) {
    let plugin,
        pluginMainFile = '';

    if (/.*\.js/.test(entry)) {
      this.createPlugin(entry);
    } else  {
      if (fs.existsSync(entry) && fs.lstatSync(entry).isDirectory()) {
        pluginMainFile = path.join(entry, 'main.js');

        if (fs.existsSync(pluginMainFile) && fs.lstatSync(pluginMainFile).isFile) {
          this.createPlugin(pluginMainFile);
        }
      }
    }
  }

  /**
   * @param {string} file
   * @returns {BasePlugin}
   */
  createPlugin(file) {
    if (__non_webpack_require__.cache[file]) {
      delete __non_webpack_require__.cache[file];
    }

    let module = __non_webpack_require__(file),
        plugin = this.bootPlugin(module, file);

    if (this.plugins.has(plugin.id)) {
      this.plugins.delete(plugin.id);
    }

    this.plugins.set(plugin.id, plugin);

    return plugin;
  }

  /**
   * @param {any} plugin
   * @param {String} file
   * @returns {any}
   */
  bootPlugin(plugin, file) {
    try {
      let pluginInstance = plugin({
        app: this.app,
        utils: {
          GetPath,
          FormatName,
          md5,
          parse,
          debug
        },
        classes: {
          BasePlugin,
          BaseProvider,
          WorkDownloader,
          Request,
          Download
        }
      });

      pluginInstance.providerName = pluginInstance.entryFile = file;
      pluginInstance.id = md5(file);

      if (!pluginInstance.title) {
        pluginInstance.title = file;
      }

      DownloadAdapter.extendMap({
        provider: pluginInstance,
        patterns: pluginInstance.patterns
      });

      if (typeof pluginInstance.requestHeadersOverrider === 'function' &&
          pluginInstance.requestUrlPatterns
      ) {
        RequestHeadersOverrider.getDefault().extendMap({
          id: pluginInstance.id,
          patterns: pluginInstance.requestUrlPatterns,
          requestHeaders: pluginInstance.requestHeadersOverrider
        });
      }

      if (typeof pluginInstance.responseHeadersOverrider === 'function' &&
          pluginInstance.responseUrlPatterns
      ) {
        ResponseHeadersOverrider.getDefault().extendMap({
          id: pluginInstance.id,
          patterns: pluginInstance.responseUrlPatterns,
          responseHeaders: pluginInstance.responseHeadersOverrider
        });
      }

      return pluginInstance;
    } catch (error) {
      this.notificationManager
          .createNotification({ title: `Unable to boot plugin. Boot file: ${file}` })
          .show();
      debug.log(error);
    }
  }

  /**
   * Get all booted plugins
   * @returns {any[]}
   */
  getPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin instance
   * @param {String} id
   * @returns {any|null}
   */
  getPlugin(id) {
    return this.plugins.has(id)
           ? this.plugins.get(id)
           : null;
  }

  /**
   * Reload plugin
   * @param {string} id
   */
  reloadPlugin(id) {
    let plugin;

    if (typeof id === 'string') {
      plugin = this.getPlugin(id);
    }

    if (plugin) {
      let reloadedPlugin = this.createPlugin(plugin.entryFile);
      this.plugins.set(id, reloadedPlugin);

      return reloadedPlugin;
    } else {
      throw new Error('_unable_to_reload_plugin');
    }
  }

  /**
   * Install a plugin.
   * @param {string} entry File or Folder
   */
  installPlugin(entry) {
    throw new Error('Method installPlugin has not been implmeneted');
  }
}

export default PluginManager;

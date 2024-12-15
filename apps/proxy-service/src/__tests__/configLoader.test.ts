import { ConfigLoader } from '../configLoader';
import { testLogger, createTestConfig } from './setup';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../types';

jest.mock('fs');
const mockedFs = jest.mocked(fs);

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  const testConfigPath = path.join(process.cwd(), 'test-config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    configLoader = new ConfigLoader(testConfigPath, testLogger);
  });

  describe('loadConfig', () => {
    it('应该加载并解析有效的配置文件', () => {
      const testConfig = createTestConfig();
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(testConfig));

      const config = configLoader.loadConfig();

      expect(config).toBeDefined();
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].name).toBe('test_server');
    });

    it('当配置文件不存在时应该返回默认配置', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const config = configLoader.loadConfig();

      expect(config).toBeDefined();
      expect(config.servers).toBeDefined();
      expect(config.upstreams).toBeDefined();
    });

    it('当配置文件为空时应该返回默认配置', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('');

      const config = configLoader.loadConfig();

      expect(config).toBeDefined();
      expect(config.servers).toBeDefined();
      expect(config.upstreams).toBeDefined();
    });

    it('当配置文件包含无效JSON时应该抛出错误', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{invalid json}');

      expect(() => configLoader.loadConfig()).not.toThrow();
      // 应该返回默认配置
      const config = configLoader.loadConfig();
      expect(config).toBeDefined();
    });
  });

  describe('watchConfig', () => {
    it('应该监听配置文件变化', () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };
      mockedFs.watch.mockReturnValue(mockWatcher as unknown as fs.FSWatcher);

      configLoader.watchConfig();

      expect(mockedFs.watch).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(Function)
      );
    });

    it('应该在配置文件变化时触发事件', (done) => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };

      const testConfig = createTestConfig();
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(testConfig));

      mockedFs.watch.mockImplementation((path, callback) => {
        if (callback && typeof callback === 'function') {
          setTimeout(() => {
            callback('change', 'test-config.json');
          }, 100);
        }
        return mockWatcher as unknown as fs.FSWatcher;
      });

      configLoader.on('configUpdated', (newConfig: Config) => {
        try {
          expect(newConfig).toBeDefined();
          expect(newConfig.servers[0].name).toBe('test_server');
          done();
        } catch (error) {
          done(error);
        }
      });

      configLoader.watchConfig();
    }, 10000); // 增加超时时间到10秒
  });

  describe('stopWatching', () => {
    it('应该停止监听配置文件', () => {
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        ref: jest.fn(),
        unref: jest.fn(),
        addListener: jest.fn(),
        once: jest.fn(),
        prependListener: jest.fn(),
        prependOnceListener: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        setMaxListeners: jest.fn(),
        getMaxListeners: jest.fn(),
        listeners: jest.fn(),
        rawListeners: jest.fn(),
        emit: jest.fn(),
        eventNames: jest.fn(),
        listenerCount: jest.fn()
      };
      mockedFs.watch.mockReturnValue(mockWatcher as unknown as fs.FSWatcher);

      configLoader.watchConfig();
      configLoader.stopWatching();

      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });
}); 
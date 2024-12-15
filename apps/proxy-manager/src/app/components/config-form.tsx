import { ServerConfig, ConfigGroup, ConfigField, UpstreamConfig, LocationConfig, RateLimitConfig, IPFilterConfig, CSRFConfig, HeadersConfig, HealthCheckConfig, ValidationResult } from '@/types/proxy-config';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { UpstreamPanel } from '@/app/components/upstream-panel';
import { useTranslation } from 'react-i18next';
import { SSLSettingsForm } from './ssl-settings-form';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ConfigStatus } from '@/services/config-service';
import { toast } from '@/hooks/use-toast';

interface ConfigFormProps {
  config?: ServerConfig;
  template: ConfigGroup[];
  upstreams?: UpstreamConfig[];
  onChange: (changes: Partial<ServerConfig>) => void;
  onUpstreamsChange: (upstreams: UpstreamConfig[]) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  error: Error | null;
  configStatus: ConfigStatus;
  updateConfig: (config: ServerConfig) => Promise<void>;
  uploadFile: (file: File, type: 'cert' | 'key' | 'other') => Promise<void>;
  subscribeToStatus: (callback: (status: ConfigStatus) => void) => () => void;
  subscribeToErrors: (callback: (error: Error) => void) => () => void;
}

export default function ConfigForm({ 
  config, 
  template, 
  upstreams, 
  onChange,
  onUpstreamsChange 
}: ConfigFormProps) {
  const { t } = useTranslation();
  const [showUpstreamPanel, setShowUpstreamPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const {
    isConnected,
    error,
    configStatus,
    updateConfig,
    uploadFile,
    subscribeToStatus,
    subscribeToErrors,
  } = useWebSocket() as UseWebSocketReturn;

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      
      // 更新配置
      await updateConfig(config);
      
      toast({
        title: t('proxy.configSaved'),
        description: t('proxy.configSavedDesc'),
      });

    } catch (err) {
      const error = err as Error;
      toast({
        title: t('proxy.saveError'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [config, updateConfig, t]);

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File, type: 'cert' | 'key' | 'other') => {
    try {
      await uploadFile(file, type);
      toast({
        title: t('proxy.fileUploaded'),
        description: t('proxy.fileUploadedDesc'),
      });
    } catch (err) {
      const error = err as Error;
      toast({
        title: t('proxy.uploadError'),
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [uploadFile, t]);

  const handleUpstreamChange = useCallback((newUpstreams: UpstreamConfig[]) => {
    onUpstreamsChange(newUpstreams);
    setShowUpstreamPanel(false);
  }, [onUpstreamsChange]);

  if (!config) return null;

  const isArrayField = (field: ConfigField, value: any): value is any[] => {
    return field.type === 'array' && Array.isArray(value);
  };

  const getFieldValue = (field: ConfigField, config: ServerConfig) => {
    const value = config[field.id as keyof ServerConfig];
    if (field.type === 'array' && !Array.isArray(value)) {
      return [];
    }
    return value;
  };

  const renderArrayField = (field: ConfigField, values: any[]) => {
    const handleAdd = () => {
      const newItem = field.children?.reduce((acc, child) => {
        acc[child.id] = child.defaultValue || '';
        return acc;
      }, {} as Record<string, any>);
      
      onChange({ 
        [field.id]: [...(values || []), newItem] 
      });
    };

    const handleRemove = (index: number) => {
      const newValues = [...values];
      newValues.splice(index, 1);
      onChange({ [field.id]: newValues });
    };

    const handleItemChange = (index: number, itemChanges: Record<string, any>) => {
      const newValues = [...values];
      const currentLocation = newValues[index] || {};
      
      console.log('handleItemChange:', {
        index,
        currentLocation,
        itemChanges
      });

      newValues[index] = {
        ...currentLocation,
        ...itemChanges
      };

      console.log('Updated locations:', newValues);
      
      onChange({ locations: newValues });
    };

    if (field.id === 'locations') {
      return (
        <div className="space-y-4">
          {values?.map((location, index) => (
            <Card key={index} className="p-4">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium">{t('proxy.pathConfig')} {index + 1}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <LocationConfigForm
                location={location}
                upstreams={upstreams || []}
                onChange={(changes) => handleItemChange(index, changes)}
              />
            </Card>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
          >
            {t('proxy.addPathConfig')}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {values?.map((value, index) => (
          <Card key={index} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <span className="text-sm font-medium">{t('common.item')} {index + 1}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4">
              {field.children?.map(childField => (
                <div key={childField.id} className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">{t(`proxy.fields.${childField.id}`)}</Label>
                  <div className="col-span-3">
                    {childField.id === 'upstream' ? (
                      <Select
                        value={value[childField.id]}
                        onValueChange={(v) => handleItemChange(index, { [childField.id]: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('proxy.selectUpstream')} />
                        </SelectTrigger>
                        <SelectContent>
                          {upstreams?.map(upstream => (
                            <SelectItem key={upstream.name} value={upstream.name}>
                              {upstream.name} ({upstream.servers.length} {t('proxy.servers')})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      renderField(
                        childField, 
                        value[childField.id],
                        (v) => handleItemChange(index, { [childField.id]: v })
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
        >
          {t('common.add')} {field.title}
        </Button>
      </div>
    );
  };

  const renderField = (
    field: ConfigField, 
    value: any, 
    onFieldChange: (value: any) => void = (v) => onChange({ [field.id]: v })
  ) => {
    const hasError = field.required && !value;

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value || field.defaultValue || ''}
            onChange={(e) => onFieldChange(e.target.value)}
            className={hasError ? 'border-red-500' : ''}
            placeholder={field.description}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value || field.defaultValue || ''}
            onChange={(e) => onFieldChange(Number(e.target.value))}
            className={hasError ? 'border-red-500' : ''}
            placeholder={field.description}
          />
        );
      case 'boolean':
        return (
          <Switch
            checked={value || field.defaultValue || false}
            onCheckedChange={(checked) => onFieldChange(checked)}
            className={hasError ? 'border-red-500' : ''}
          />
        );
      case 'select':
        return (
          <Select
            value={value || field.defaultValue}
            onValueChange={(value) => onFieldChange(value)}
          >
            <SelectTrigger className={hasError ? 'border-red-500' : ''}>
              <SelectValue placeholder={field.description} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'array':
        return renderArrayField(field, value || []);
      default:
        return null;
    }
  };

  const LocationConfigForm = ({ 
    location, 
    upstreams,
    onChange 
  }: {
    location: LocationConfig;
    upstreams: UpstreamConfig[];
    onChange: (changes: Partial<LocationConfig>) => void;
  }) => {
    const [proxyType, setProxyType] = useState<'upstream' | 'proxy_pass' | 'static'>(() => {
      if (location.upstream !== undefined) return 'upstream';
      if (location.proxy_pass !== undefined) return 'proxy_pass';
      return 'static';
    });

    useEffect(() => {
      if (location.upstream !== undefined) {
        setProxyType('upstream');
      } else if (location.proxy_pass !== undefined) {
        setProxyType('proxy_pass');
      } else if (location.root !== undefined || location.return !== undefined) {
        setProxyType('static');
      }
    }, [location]);

    console.log('LocationConfigForm render:', { location, proxyType });

    const handleProxyTypeChange = (newType: 'upstream' | 'proxy_pass' | 'static') => {
      console.log('Changing proxy type to:', newType);
      
      switch (newType) {
        case 'upstream':
          onChange({ 
            upstream: '', 
            proxy_pass: undefined, 
            root: undefined, 
            return: undefined 
          });
          break;
        case 'proxy_pass':
          onChange({ 
            proxy_pass: '', 
            upstream: undefined, 
            root: undefined, 
            return: undefined 
          });
          break;
        case 'static':
          onChange({ 
            root: '/var/www/html', 
            return: '', 
            upstream: undefined, 
            proxy_pass: undefined 
          });
          break;
        default:
          break;
      }

      setProxyType(newType);
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-1">
            <Label>{t('proxy.path')}</Label>
            <Input
              value={location.path || '/'}
              onChange={e => onChange({ path: e.target.value })}
              placeholder="/api/*"
            />
          </div>
          <div className="col-span-3">
            <Label>{t('proxy.proxyType')}</Label>
            <Select
              value={proxyType}
              onValueChange={handleProxyTypeChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {proxyType === 'upstream' && t('proxy.upstream')}
                  {proxyType === 'proxy_pass' && t('proxy.proxyPass')}
                  {proxyType === 'static' && t('proxy.staticResponse')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upstream">{t('proxy.upstream')}</SelectItem>
                <SelectItem value="proxy_pass">{t('proxy.proxyPass')}</SelectItem>
                <SelectItem value="static">{t('proxy.staticResponse')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {proxyType === 'upstream' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>{t('proxy.selectUpstream')}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpstreamPanel(true)}
              >
                {t('proxy.newUpstream')}
              </Button>
            </div>
            <Select
              value={location.upstream}
              onValueChange={value => onChange({ upstream: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('proxy.selectUpstream')} />
              </SelectTrigger>
              <SelectContent>
                {upstreams?.map(upstream => (
                  <SelectItem key={upstream.name} value={upstream.name}>
                    {upstream.name} ({upstream.servers.length} {t('proxy.servers')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {proxyType === 'proxy_pass' && (
          <div>
            <Label>{t('proxy.proxyAddress')}</Label>
            <Input
              value={location.proxy_pass || ''}
              onChange={e => onChange({ proxy_pass: e.target.value })}
              placeholder="http://backend-service:8080"
            />
          </div>
        )}

        {proxyType === 'static' && (
          <div className="space-y-4">
            <div>
              <Label>{t('proxy.staticFileRoot')}</Label>
              <Input
                value={location.root || ''}
                onChange={e => onChange({ root: e.target.value })}
                placeholder="/var/www/html"
              />
            </div>
            <div>
              <Label>{t('proxy.directReturn')}</Label>
              <Input
                value={location.return || ''}
                onChange={e => onChange({ return: e.target.value })}
                placeholder="200 OK"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const SecuritySettingsForm = ({ config, onChange }: {
    config: ServerConfig;
    onChange: (changes: Partial<ServerConfig>) => void;
  }) => {
    // 检查是否启用了自定义安全设置
    const isCustomSecurityEnabled = !!(config.rateLimit || config.ipFilter || config.csrf);

      // 处理自定义安全设置的开关
    const handleCustomSecurityToggle = (checked: boolean) => {
      if (checked) {
        // 启用时设置默认配置
        onChange({
          rateLimit: {
            windowMs: 60000,
            max: 100,
            message: t('proxy.errorMessage'),
            statusCode: 429
          },
          ipFilter: {
            blacklist: [],
            whitelist: []
          },
          csrf: {
            enabled: true,
            forced: false,
            customPaths: [],
            excludePaths: [],
            tokenNames: ['_csrf']
          }
        });
      } else {
        // 关闭时清除所有安全设置
        onChange({
          rateLimit: undefined,
          ipFilter: undefined,
          csrf: undefined
        });
      }
    };

    // 默认的速率限制配置
    const defaultRateLimit: RateLimitConfig = {
      windowMs: 60000,  // 1分钟
      max: 100,        // 最大100次请求
      message: t('proxy.errorMessage'),
      statusCode: 429
    };

    // 获取当前的速率限制配置，确保所有必需字段都有值
    const getCurrentRateLimit = (): RateLimitConfig => ({
      windowMs: config.rateLimit?.windowMs ?? defaultRateLimit.windowMs,
      max: config.rateLimit?.max ?? defaultRateLimit.max,
      message: config.rateLimit?.message ?? defaultRateLimit.message,
      statusCode: config.rateLimit?.statusCode ?? defaultRateLimit.statusCode
    });

    // 默认的IP过滤配置
    const defaultIpFilter: Required<IPFilterConfig> = {
            blacklist: [],
            whitelist: []
    };

    // 获取当前的IP过滤配置，确保所有字段都有值
    const getCurrentIpFilter = (): Required<IPFilterConfig> => ({
      blacklist: config.ipFilter?.blacklist ?? [],
      whitelist: config.ipFilter?.whitelist ?? []
    });

    // 默认的CSRF配置
    const defaultCsrf: Required<CSRFConfig> = {
            enabled: true,
            forced: false,
            customPaths: [],
            excludePaths: [],
            tokenNames: ['_csrf']
    };

    // 获取当前的CSRF配置，确保所有字段都有值
    const getCurrentCsrf = (): Required<CSRFConfig> => ({
      enabled: config.csrf?.enabled ?? defaultCsrf.enabled,
      forced: config.csrf?.forced ?? defaultCsrf.forced,
      customPaths: config.csrf?.customPaths ?? defaultCsrf.customPaths,
      excludePaths: config.csrf?.excludePaths ?? defaultCsrf.excludePaths,
      tokenNames: config.csrf?.tokenNames ?? defaultCsrf.tokenNames
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Label>{t('proxy.customSecurity')}</Label>
          <Switch
            checked={isCustomSecurityEnabled}
            onCheckedChange={handleCustomSecurityToggle}
          />
        </div>

        {!isCustomSecurityEnabled && (
          <p className="text-sm text-gray-500">{t('proxy.useDefaultSecurity')}</p>
        )}

        {isCustomSecurityEnabled && (
          <div className="space-y-6">
            {/* 速率限制设置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('proxy.rateLimit')}</Label>
                <Switch
                  checked={!!config.rateLimit}
                  onCheckedChange={(checked) => {
                    onChange({
                      rateLimit: checked ? defaultRateLimit : undefined
                    });
                  }}
                />
              </div>
              
              {config.rateLimit && (
                <div className="grid gap-4 pl-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.windowMs')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.rateLimit.windowMs}
                      onChange={(e) => {
                        const currentConfig = getCurrentRateLimit();
                        onChange({
                          rateLimit: {
                            ...currentConfig,
                            windowMs: parseInt(e.target.value) || defaultRateLimit.windowMs
                          }
                        });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.maxRequests')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.rateLimit.max}
                      onChange={(e) => {
                        const currentConfig = getCurrentRateLimit();
                        onChange({
                          rateLimit: {
                            ...currentConfig,
                            max: parseInt(e.target.value) || defaultRateLimit.max
                          }
                        });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.errorMessage')}</Label>
                    <Input
                      className="col-span-3"
                      value={config.rateLimit.message}
                      onChange={(e) => {
                        const currentConfig = getCurrentRateLimit();
                        onChange({
                          rateLimit: {
                            ...currentConfig,
                            message: e.target.value || defaultRateLimit.message
                          }
                        });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.statusCode')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.rateLimit.statusCode}
                      onChange={(e) => {
                        const currentConfig = getCurrentRateLimit();
                        onChange({
                          rateLimit: {
                            ...currentConfig,
                            statusCode: parseInt(e.target.value) || defaultRateLimit.statusCode
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* IP过滤设置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('proxy.ipFilter')}</Label>
                <Switch
                  checked={!!config.ipFilter}
                  onCheckedChange={(checked) => {
                    onChange({
                      ipFilter: checked ? defaultIpFilter : undefined
                    });
                  }}
                />
              </div>
              
              {config.ipFilter && (
                <div className="grid gap-4 pl-4">
                  <div className="space-y-2">
                    <Label>{t('proxy.whitelist')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterIp')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentConfig = getCurrentIpFilter();
                              if (!currentConfig.whitelist.includes(value)) {
                              onChange({
                                ipFilter: {
                                    ...currentConfig,
                                    whitelist: [...currentConfig.whitelist, value]
                                }
                              });
                              input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.ipFilter.whitelist?.map((ip) => (
                        <div key={ip} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{ip}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentConfig = getCurrentIpFilter();
                              onChange({
                                ipFilter: {
                                  ...currentConfig,
                                  whitelist: currentConfig.whitelist.filter(item => item !== ip)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{t('proxy.blacklist')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterIp')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentConfig = getCurrentIpFilter();
                              if (!currentConfig.blacklist.includes(value)) {
                                onChange({
                                  ipFilter: {
                                    ...currentConfig,
                                    blacklist: [...currentConfig.blacklist, value]
                                  }
                                });
                                input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.ipFilter.blacklist?.map((ip) => (
                        <div key={ip} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{ip}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentConfig = getCurrentIpFilter();
                              onChange({
                                ipFilter: {
                                  ...currentConfig,
                                  blacklist: currentConfig.blacklist.filter(item => item !== ip)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CSRF防护设置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('proxy.csrfProtection')}</Label>
                <Switch
                  checked={!!config.csrf?.enabled}
                  onCheckedChange={(checked) => {
                    onChange({
                      csrf: checked ? defaultCsrf : undefined
                    });
                  }}
                />
              </div>
              
              {config.csrf?.enabled && (
                <div className="grid gap-4 pl-4">
                  <div className="flex items-center gap-4">
                    <Label>{t('proxy.forceAllRequests')}</Label>
                    <Switch
                      checked={!!config.csrf.forced}
                      onCheckedChange={(checked) => {
                        const currentConfig = getCurrentCsrf();
                        onChange({
                          csrf: {
                            ...currentConfig,
                            forced: checked
                          }
                        });
                      }}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{t('proxy.customProtectedPaths')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterPath')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentConfig = getCurrentCsrf();
                              if (!currentConfig.customPaths.includes(value)) {
                                onChange({
                                  csrf: {
                                    ...currentConfig,
                                    customPaths: [...currentConfig.customPaths, value]
                                  }
                                });
                                input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.csrf.customPaths?.map((path) => (
                        <div key={path} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{path}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentConfig = getCurrentCsrf();
                              onChange({
                                csrf: {
                                  ...currentConfig,
                                  customPaths: currentConfig.customPaths.filter(item => item !== path)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('proxy.excludePaths')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterPath')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentConfig = getCurrentCsrf();
                              if (!currentConfig.excludePaths.includes(value)) {
                                onChange({
                                  csrf: {
                                    ...currentConfig,
                                    excludePaths: [...currentConfig.excludePaths, value]
                                  }
                                });
                                input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.csrf.excludePaths?.map((path) => (
                        <div key={path} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{path}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentConfig = getCurrentCsrf();
                              onChange({
                                csrf: {
                                  ...currentConfig,
                                  excludePaths: currentConfig.excludePaths.filter(item => item !== path)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('proxy.tokenName')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterTokenName')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentConfig = getCurrentCsrf();
                              if (!currentConfig.tokenNames.includes(value)) {
                                onChange({
                                  csrf: {
                                    ...currentConfig,
                                    tokenNames: [...currentConfig.tokenNames, value]
                                  }
                                });
                                input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {config.csrf.tokenNames?.map((name) => (
                        <div key={name} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentConfig = getCurrentCsrf();
                              onChange({
                                csrf: {
                                  ...currentConfig,
                                  tokenNames: currentConfig.tokenNames.filter(item => item !== name)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const AdvancedSettingsForm = ({ config, onChange }: {
    config: ServerConfig;
    onChange: (changes: Partial<ServerConfig>) => void;
  }) => {
    // 检查是否启用了自定义高级设置
    const isCustomAdvancedEnabled = !!(config.headers || config.healthCheck);

      // 处理自定义高级设置的开关
    const handleCustomAdvancedToggle = (checked: boolean) => {
      if (checked) {
        // 启用时设置默认配置
        onChange({
          headers: {
            add: {},
            remove: []
          },
          healthCheck: {
            enabled: true,
            type: 'http',
            interval: 30000,
            timeout: 5000,
            retries: 3,
            path: '/health'
          }
        });
      } else {
        // 关闭时清除所有高级设置
        onChange({
          headers: undefined,
          healthCheck: undefined
        });
      }
    };

    // 默认的headers配置
    const defaultHeaders: Required<HeadersConfig> = {
      add: {},
      remove: []
    };

    // 获取当前的headers配置
    const getCurrentHeaders = (): Required<HeadersConfig> => ({
      add: config.headers?.add ?? {},
      remove: config.headers?.remove ?? []
    });

    // 默认的健康检查配置（包含所有必需字段）
    const defaultHealthCheck: Required<HealthCheckConfig> = {
      enabled: true,
      type: 'http',
      interval: 30000,
      timeout: 5000,
      retries: 3,
      path: '/health',
      // 其他字段使用默认值
      headers: {},
      expectedStatus: [200],      // 修改为数组，默认接受 200 状态码
      expectedBody: '',
      followRedirects: true,
      allowInsecure: false,
      tcpOptions: {
        port: 80,
        host: '127.0.0.1',
      },
      onSuccess: () => {},
      onError: () => {},
    };

    // 获取当前配置，保持所有字段的完整性
    const getCurrentHealthCheck = (): Required<HealthCheckConfig> => ({
      ...defaultHealthCheck,  // 先用默认值填充所有字段
      // 只覆盖 UI 中显示的字段
      enabled: config.healthCheck?.enabled ?? defaultHealthCheck.enabled,
      type: config.healthCheck?.type ?? defaultHealthCheck.type,
      interval: config.healthCheck?.interval ?? defaultHealthCheck.interval,
      timeout: config.healthCheck?.timeout ?? defaultHealthCheck.timeout,
      retries: config.healthCheck?.retries ?? defaultHealthCheck.retries,
      path: config.healthCheck?.path ?? defaultHealthCheck.path,
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Label>{t('proxy.customAdvanced')}</Label>
          <Switch
            checked={isCustomAdvancedEnabled}
            onCheckedChange={handleCustomAdvancedToggle}
          />
        </div>

        {!isCustomAdvancedEnabled && (
          <p className="text-sm text-gray-500">{t('proxy.useDefaultAdvanced')}</p>
        )}

        {isCustomAdvancedEnabled && (
          <div className="space-y-6">
            {/* 自定义响应头 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('proxy.customHeaders')}</Label>
                <Switch
                  checked={!!config.headers}
                  onCheckedChange={(checked) => {
                    onChange({
                      headers: checked ? defaultHeaders : undefined
                    });
                  }}
                />
              </div>
              
              {config.headers && (
                <div className="grid gap-4 pl-4">
                  <div className="space-y-2">
                    <Label>{t('proxy.addHeaders')}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder={t('proxy.headerName')} />
                      <Input placeholder={t('proxy.headerValue')} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(getCurrentHeaders().add).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{key}: {value}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentHeaders = getCurrentHeaders();
                              const newAdd = { ...currentHeaders.add };
                              delete newAdd[key];
                              onChange({
                                headers: {
                                  ...currentHeaders,
                                  add: newAdd
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{t('proxy.removeHeaders')}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('proxy.enterHeaderName')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const currentHeaders = getCurrentHeaders();
                              if (!currentHeaders.remove.includes(value)) {
                                onChange({
                                  headers: {
                                    ...currentHeaders,
                                    remove: [...currentHeaders.remove, value]
                                  }
                                });
                                input.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getCurrentHeaders().remove.map((header) => (
                        <div key={header} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded">
                          <span>{header}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4"
                            onClick={() => {
                              const currentHeaders = getCurrentHeaders();
                              onChange({
                                headers: {
                                  ...currentHeaders,
                                  remove: currentHeaders.remove.filter(item => item !== header)
                                }
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 健康检查设置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('proxy.healthCheck')}</Label>
                <Switch
                  checked={!!config.healthCheck?.enabled}
                  onCheckedChange={(checked) => {
                    onChange({
                      healthCheck: checked ? defaultHealthCheck : undefined
                    });
                  }}
                />
              </div>
              
              {config.healthCheck?.enabled && (
                <div className="grid gap-4 pl-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.checkType')}</Label>
                    <Select
                      value={config.healthCheck.type}
                      onValueChange={(value: 'http' | 'tcp') => {
                        const currentConfig = getCurrentHealthCheck();
                        onChange({
                          healthCheck: {
                            ...currentConfig,
                            type: value
                          }
                        });
                      }}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.healthCheck.type === 'http' && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">{t('proxy.checkPath')}</Label>
                      <Input
                        className="col-span-3"
                        value={config.healthCheck.path}
                        onChange={(e) => {
                          const currentConfig = getCurrentHealthCheck();
                          onChange({
                            healthCheck: {
                              ...currentConfig,
                              path: e.target.value
                            }
                          });
                        }}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.checkInterval')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.healthCheck.interval}
                      onChange={(e) => {
                        const currentConfig = getCurrentHealthCheck();
                        onChange({
                          healthCheck: {
                            ...currentConfig,
                            interval: parseInt(e.target.value) || defaultHealthCheck.interval
                          }
                        });
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.timeout')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.healthCheck.timeout}
                      onChange={(e) => {
                        const currentConfig = getCurrentHealthCheck();
                        onChange({
                          healthCheck: {
                            ...currentConfig,
                            timeout: parseInt(e.target.value) || defaultHealthCheck.timeout
                          }
                        });
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">{t('proxy.retries')}</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={config.healthCheck.retries}
                      onChange={(e) => {
                        const currentConfig = getCurrentHealthCheck();
                        onChange({
                          healthCheck: {
                            ...currentConfig,
                            retries: parseInt(e.target.value) || defaultHealthCheck.retries
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('proxy.configTitle')}</h2>
        <div className="flex items-center gap-4">
          {!isConnected && (
            <p className="text-sm text-red-500">{t('proxy.notConnected')}</p>
          )}
          <Button 
            onClick={handleSave}
            disabled={!isConnected || isSaving}
          >
            {isSaving ? t('proxy.saving') : t('proxy.save')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      {showUpstreamPanel && (
        <div 
          className="fixed inset-0 bg-black/50 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowUpstreamPanel(false);
            }
          }}
        >
          <div className="fixed inset-x-0 top-0 bg-white p-6 shadow-lg max-w-4xl mx-auto mt-20 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">{t('proxy.configUpstream')}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowUpstreamPanel(false)}
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <UpstreamPanel 
              upstreams={upstreams || []}
              onUpstreamChange={handleUpstreamChange}
            />
          </div>
        </div>
      )}

      {/* 基础配置和路径配置部分 */}
      {template.map((group) => {
        if (group.id === 'security' || group.id === 'advanced') {
          return null;
        }
        
        return (
          <div key={group.id} className="space-y-4">
            <h3 className="text-lg font-medium">{group.title}</h3>
            <Card className="p-6">
              <div className="space-y-4">
                {group.fields.map((field) => (
                  <div key={field.id} className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">
                      {field.title}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <div className="col-span-3">
                      {isArrayField(field, getFieldValue(field, config))
                        ? renderArrayField(field, getFieldValue(field, config) as any[])
                        : renderField(field, getFieldValue(field, config))}
                      {field.description && (
                        <p className="text-sm text-gray-500 mt-1">{field.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })}

      {/* 安全设置部分 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t('proxy.securitySettings')}</h3>
        <Card className="p-6">
          <SecuritySettingsForm config={config} onChange={onChange} />
        </Card>
      </div>

      {/* 高级设置部分 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t('proxy.advancedSettings')}</h3>
        <Card className="p-6">
          <AdvancedSettingsForm config={config} onChange={onChange} />
        </Card>
      </div>

      {/* SSL设置面板 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t('proxy.sslSettings')}</h3>
        <Card className="p-6">
          <SSLSettingsForm
            config={config}
            onChange={onChange}
          />
        </Card>
      </div>
    </div>
  );
} 
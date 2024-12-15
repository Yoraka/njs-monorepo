import { ServerConfig, SSLConfig } from '@/types/proxy-config';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Upload, Shield, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '@/hooks/useWebSocket';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SSLSettingsFormProps {
  config: ServerConfig;
  onChange: (changes: Partial<ServerConfig>) => void;
}

// 默认的SSL配置
const defaultSSL: SSLConfig = {
  enabled: false,
  cert: '',
  key: '',
  http2: false,
  protocols: ['TLSv1.2', 'TLSv1.3'],
  sslRedirect: true,
  clientCertificate: {
    enabled: false,
    verify: 'optional' as const
  }
};

export const SSLSettingsForm = ({ config, onChange }: SSLSettingsFormProps) => {
  const { t } = useTranslation();
  const { uploadFile } = useWebSocket();

  // 获取当前的SSL配置，确保所有字段都有值
  const getCurrentSSL = (): SSLConfig => ({
    enabled: config.ssl?.enabled ?? defaultSSL.enabled,
    cert: config.ssl?.cert ?? defaultSSL.cert,
    key: config.ssl?.key ?? defaultSSL.key,
    http2: config.ssl?.http2 ?? defaultSSL.http2,
    protocols: config.ssl?.protocols ?? defaultSSL.protocols,
    sslRedirect: config.ssl?.sslRedirect ?? defaultSSL.sslRedirect,
    clientCertificate: {
      enabled: config.ssl?.clientCertificate?.enabled ?? defaultSSL.clientCertificate.enabled,
      verify: config.ssl?.clientCertificate?.verify ?? defaultSSL.clientCertificate.verify
    }
  });

  // 处理文件上传
  const handleFileUpload = (type: 'cert' | 'key') => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await uploadFile(file, type);
        
        const reader = new FileReader();
        reader.onload = (e) => {
          const currentConfig = getCurrentSSL();
          onChange({
            ssl: {
              ...currentConfig,
              [type]: e.target?.result as string
            }
          });
        };
        reader.readAsText(file);

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
    }
  };

  return (
    <div className="space-y-8">
      {/* 证书配置部分 */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Shield className="h-5 w-5 text-gray-500" />
          <h3 className="text-base font-medium">{t('proxy.certificateConfig')}</h3>
        </div>
        
        <div className="grid gap-6 pl-7">
          {/* 证书文件上传 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {t('proxy.certificate')}
            </Label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  type="file"
                  accept=".pem,.crt"
                  onChange={handleFileUpload('cert')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed transition-colors hover:bg-gray-50",
                  config.ssl?.cert ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"
                )}>
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {config.ssl?.cert ? t('proxy.certificateUploaded') : t('proxy.chooseCertificate')}
                  </span>
                </div>
              </div>
              {config.ssl?.cert && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    const currentConfig = getCurrentSSL();
                    onChange({
                      ssl: {
                        ...currentConfig,
                        cert: ''
                      }
                    });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 私钥文件上传 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {t('proxy.privateKey')}
            </Label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  type="file"
                  accept=".pem,.key"
                  onChange={handleFileUpload('key')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed transition-colors hover:bg-gray-50",
                  config.ssl?.key ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"
                )}>
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {config.ssl?.key ? t('proxy.privateKeyUploaded') : t('proxy.choosePrivateKey')}
                  </span>
                </div>
              </div>
              {config.ssl?.key && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    const currentConfig = getCurrentSSL();
                    onChange({
                      ssl: {
                        ...currentConfig,
                        key: ''
                      }
                    });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 协议设置部分 */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Zap className="h-5 w-5 text-gray-500" />
          <h3 className="text-base font-medium">{t('proxy.protocolSettings')}</h3>
        </div>

        <div className="grid gap-6 pl-7">
          {/* HTTP/2 开关 */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">
                {t('proxy.http2')}
              </Label>
              <p className="text-sm text-gray-500">
                {t('proxy.http2Description')}
              </p>
            </div>
            <Switch
              checked={!!config.ssl?.http2}
              onCheckedChange={(checked) => {
                const currentConfig = getCurrentSSL();
                onChange({
                  ssl: {
                    ...currentConfig,
                    http2: checked
                  }
                });
              }}
            />
          </div>

          {/* TLS协议版本选择 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">
              {t('proxy.tlsProtocols')}
            </Label>
            <div className="flex flex-wrap gap-3">
              {['TLSv1.2', 'TLSv1.3'].map((protocol) => (
                <div
                  key={protocol}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
                    config.ssl?.protocols?.includes(protocol)
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 bg-gray-50/50"
                  )}
                >
                  <Switch
                    checked={config.ssl?.protocols?.includes(protocol) ?? false}
                    onCheckedChange={(checked) => {
                      const currentConfig = getCurrentSSL();
                      const newProtocols = checked
                        ? [...(currentConfig.protocols || []), protocol]
                        : (currentConfig.protocols || []).filter((p) => p !== protocol);
                      onChange({
                        ssl: {
                          ...currentConfig,
                          protocols: newProtocols
                        }
                      });
                    }}
                  />
                  <span className="text-sm font-medium text-gray-700">{protocol}</span>
                </div>
              ))}
            </div>
          </div>

          {/* HTTP重定向HTTPS开关 */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">
                {t('proxy.sslRedirect')}
              </Label>
              <p className="text-sm text-gray-500">
                {t('proxy.sslRedirectDescription')}
              </p>
            </div>
            <Switch
              checked={!!config.ssl?.sslRedirect}
              onCheckedChange={(checked) => {
                const currentConfig = getCurrentSSL();
                onChange({
                  ssl: {
                    ...currentConfig,
                    sslRedirect: checked
                  }
                });
              }}
            />
          </div>

          {/* 客户端证书设置 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700">
                  {t('proxy.clientCertificate')}
                </Label>
                <p className="text-sm text-gray-500">
                  {t('proxy.clientCertDescription')}
                </p>
              </div>
              <Switch
                checked={!!config.ssl?.clientCertificate?.enabled}
                onCheckedChange={(checked) => {
                  const currentConfig = getCurrentSSL();
                  onChange({
                    ssl: {
                      ...currentConfig,
                      clientCertificate: {
                        ...currentConfig.clientCertificate,
                        enabled: checked,
                        verify: currentConfig.clientCertificate.verify
                      }
                    }
                  });
                }}
              />
            </div>

            {config.ssl?.clientCertificate?.enabled && (
              <div className="pl-6 pt-2 border-l-2 border-gray-100">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">
                    {t('proxy.verifyMode')}
                  </Label>
                  <Select
                    value={config.ssl?.clientCertificate?.verify ?? 'optional'}
                    onValueChange={(value: 'optional' | 'require') => {
                      const currentConfig = getCurrentSSL();
                      onChange({
                        ssl: {
                          ...currentConfig,
                          clientCertificate: {
                            ...currentConfig.clientCertificate,
                            verify: value
                          }
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="optional">{t('proxy.optional')}</SelectItem>
                      <SelectItem value="require">{t('proxy.required')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SSLSettingsForm; 
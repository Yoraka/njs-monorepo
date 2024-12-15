import { ServerConfig, SSLConfig } from '@/types/proxy-config';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '@/hooks/useWebSocket';
import { toast } from '@/hooks/use-toast';

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
        // 上传文件
        await uploadFile(file, type);
        
        // 读取文件内容
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label>{t('proxy.sslSettings')}</Label>
        <Switch
          checked={!!config.ssl?.enabled}
          onCheckedChange={(checked) => {
            onChange({
              ssl: checked ? defaultSSL : undefined
            });
          }}
        />
      </div>

      {config.ssl?.enabled && (
        <div className="grid gap-4 pl-4">
          {/* 证书文件上传 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('proxy.certificate')}</Label>
            <div className="col-span-3">
              <Input
                type="file"
                accept=".pem,.crt"
                onChange={handleFileUpload('cert')}
              />
              {config.ssl.cert && (
                <p className="text-sm text-gray-500 mt-1">
                  {t('proxy.certificateUploaded')}
                </p>
              )}
            </div>
          </div>

          {/* 私钥文件上传 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('proxy.privateKey')}</Label>
            <div className="col-span-3">
              <Input
                type="file"
                accept=".pem,.key"
                onChange={handleFileUpload('key')}
              />
              {config.ssl.key && (
                <p className="text-sm text-gray-500 mt-1">
                  {t('proxy.privateKeyUploaded')}
                </p>
              )}
            </div>
          </div>

          {/* HTTP/2 开关 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('proxy.http2')}</Label>
            <div className="col-span-3">
              <Switch
                checked={!!config.ssl.http2}
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
          </div>

          {/* TLS协议版本选择 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('proxy.tlsProtocols')}</Label>
            <div className="col-span-3 flex flex-wrap gap-2">
              {['TLSv1.2', 'TLSv1.3'].map((protocol) => (
                <div
                  key={protocol}
                  className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded"
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
                  <span>{protocol}</span>
                </div>
              ))}
            </div>
          </div>

          {/* HTTP重定向HTTPS开关 */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">{t('proxy.sslRedirect')}</Label>
            <div className="col-span-3">
              <Switch
                checked={!!config.ssl.sslRedirect}
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
          </div>

          {/* 客户端证书设置 */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right">{t('proxy.clientCertificate')}</Label>
            <div className="col-span-3 space-y-4">
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

              {config.ssl?.clientCertificate?.enabled && (
                <div className="pl-4">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label>{t('proxy.verifyMode')}</Label>
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
                      <SelectTrigger className="col-span-2">
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
      )}
    </div>
  );
};

export default SSLSettingsForm; 
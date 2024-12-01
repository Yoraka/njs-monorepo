import { JsonConfig } from '@/types/proxy-config';
import { writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';

export async function POST(request: Request) {
  try {
    const config: JsonConfig = await request.json();
    const configPath = path.join(process.cwd(), 'config', 'proxy-config.json');
    
    await writeFile(configPath, JSON.stringify(config, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
} 
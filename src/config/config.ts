import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface EclassConfig {
  id: string;
  pw: string;
  configPath: string;
}

const CONFIG_DIR = join(homedir(), '.eclass-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getConfig(): EclassConfig {
  const envId = process.env.ECLASS_ID?.trim();
  const envPw = process.env.ECLASS_PW?.trim();

  if (envId && envPw) {
    return { id: envId, pw: envPw, configPath: 'env' };
  }

  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify({ id: '', pw: '' }, null, 2) + '\n');
    throw new Error(
      `설정파일이 생성되었습니다: ${CONFIG_FILE}\nid와 pw를 입력해주세요.`
    );
  }

  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  const id = raw.id?.trim();
  const pw = raw.pw?.trim();

  if (!id || !pw) {
    throw new Error(`설정파일에 id와 pw를 입력해주세요: ${CONFIG_FILE}`);
  }

  return { id, pw, configPath: CONFIG_FILE };
}

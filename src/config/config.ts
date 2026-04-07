import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface EclassConfig {
  id: string;
  pw: string;
  university: string; // 예: 'tukorea.ac.kr', 'sogang.ac.kr'
  configPath: string;
}

const CONFIG_DIR = join(homedir(), '.eclass-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_UNIVERSITY = 'tukorea.ac.kr';

export function getConfig(): EclassConfig {
  const envId = process.env.ECLASS_ID?.trim();
  const envPw = process.env.ECLASS_PW?.trim();
  const envUniversity = process.env.ECLASS_UNIVERSITY?.trim();

  if (envId && envPw) {
    return {
      id: envId,
      pw: envPw,
      university: envUniversity || DEFAULT_UNIVERSITY,
      configPath: 'env',
    };
  }

  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ id: '', pw: '', university: DEFAULT_UNIVERSITY }, null, 2) + '\n',
    );
    throw new Error(
      `설정파일이 생성되었습니다: ${CONFIG_FILE}\nid와 pw를 입력해주세요.`,
    );
  }

  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  const id = raw.id?.trim();
  const pw = raw.pw?.trim();

  if (!id || !pw) {
    throw new Error(`설정파일에 id와 pw를 입력해주세요: ${CONFIG_FILE}`);
  }

  const university = raw.university?.trim() || envUniversity || DEFAULT_UNIVERSITY;

  return { id, pw, university, configPath: CONFIG_FILE };
}

import { Command } from 'commander';
import type { MaterialService } from '../domain/services/material-service.js';
import { printMaterials, outputJson } from '../output/formatters.js';

export function registerMaterial(program: Command, materialService: MaterialService) {
  const material = program.command('material').description('강의자료');

  material
    .command('ls')
    .description('강의자료 목록')
    .requiredOption('-c, --course <course>', '과목명')
    .option('--json', 'JSON 출력')
    .action(async (opts) => {
      const items = await materialService.listMaterials(opts.course);
      if (opts.json) outputJson(items);
      else printMaterials(items);
    });

  material
    .command('download <artlNum>')
    .description('강의자료 다운로드')
    .option('-o, --output <path>', '저장 경로')
    .action(async (artlNum, opts) => {
      const savedPath = await materialService.download(artlNum, opts.output);
      console.log(`다운로드 완료: ${savedPath}`);
    });
}

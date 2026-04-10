import { describe, expect, it } from 'vitest';
import {
  combineSeqCsv,
  extractContentSeqFromUpdateScript,
  extractEditorImageId,
  mergeAssignmentsBySeq,
  normalizeEditorImageSrc,
  parseReportAssignmentsFromListHtml,
} from '../src/domain/services/assignment-service.js';

describe('assignment-service helpers', () => {
  it('combineSeqCsv dedupes and preserves order', () => {
    expect(combineSeqCsv('old1, old2', '', 'old2,new3', undefined, 'new3,new4')).toBe('old1,old2,new3,new4');
  });

  it('normalizeEditorImageSrc converts absolute editor URLs to relative paths', () => {
    expect(
      normalizeEditorImageSrc('https://eclass.tukorea.ac.kr/ilosfiles/editor-file/795851CD34725953C832/2026/ABC123.png'),
    ).toBe('/ilosfiles/editor-file/795851CD34725953C832/2026/ABC123.png');
    expect(normalizeEditorImageSrc('/ilosfiles/editor-file/795851CD34725953C832/2026/ABC123.png')).toBe(
      '/ilosfiles/editor-file/795851CD34725953C832/2026/ABC123.png',
    );
  });

  it('extractEditorImageId derives the image id from the uploaded filename', () => {
    expect(
      extractEditorImageId('https://eclass.tukorea.ac.kr/ilosfiles/editor-file/795851CD34725953C832/2026/ABC123.png'),
    ).toBe('ABC123');
  });

  it('extractContentSeqFromUpdateScript finds CONTENT_SEQ in updateGo payloads', () => {
    const script = `function updateGo(){ $.ajax({ data: { RT_SEQ : "6444455", CONTENT_SEQ : "6472277", FILE_SEQS : getFileSeqs() } }); }`;
    expect(extractContentSeqFromUpdateScript(script)).toBe('6472277');
  });

  it('parseReportAssignmentsFromListHtml parses submitted rows from course report list html', () => {
    const html = `
      <table>
        <tr class="list" style="cursor:pointer;">
          <td class="number">9</td>
          <td></td>
          <td onclick="pageMove('/ilos/st/course/report_view_form.acl?RT_SEQ=6444455&SCH_KEY=&SCH_VALUE=&display=1&start=1'); return false;">
            <a class="site-link"><div class="subjt_top">5주차 수업과제</div><div class="subjt_bottom"><span>온라인</span></div></a>
          </td>
          <td>진행중</td>
          <td><img alt="제출" src="/ilos/images/user_check.png" title="제출"></td>
          <td>비공개</td>
          <td>5</td>
          <td>2026.04.10 오후 11:59</td>
        </tr>
        <tr class="list" style="cursor:pointer;">
          <td class="number">7</td>
          <td></td>
          <td onclick="pageMove('/ilos/st/course/report_view_form.acl?RT_SEQ=6421958&SCH_KEY=&SCH_VALUE=&display=1&start=1'); return false;">
            <a class="site-link"><div class="subjt_top">5주차 교재과제</div><div class="subjt_bottom"><span>온라인</span></div></a>
          </td>
          <td>종료</td>
          <td><img alt="제출" src="/ilos/images/user_check.png" title="제출"></td>
          <td>5</td>
          <td>5</td>
          <td>2026.04.03 오후 11:59</td>
        </tr>
      </table>
    `;

    expect(parseReportAssignmentsFromListHtml(html, '비즈니스영어(01)', 'A20261CAI3100101')).toEqual([
      {
        title: '5주차 수업과제',
        course: '비즈니스영어(01)',
        category: 'report',
        dDay: '',
        deadline: '2026.04.10 오후 11:59',
        status: '진행중',
        kjkey: 'A20261CAI3100101',
        seq: '6444455',
      },
      {
        title: '5주차 교재과제',
        course: '비즈니스영어(01)',
        category: 'report',
        dDay: '',
        deadline: '2026.04.03 오후 11:59',
        status: '종료',
        kjkey: 'A20261CAI3100101',
        seq: '6421958',
      },
    ]);
  });

  it('mergeAssignmentsBySeq keeps primary todo metadata but backfills missing fields from report list', () => {
    const merged = mergeAssignmentsBySeq(
      [
        {
          title: '5주차 수업과제',
          course: '비즈니스영어',
          category: 'report',
          dDay: 'D-0',
          deadline: '2026.04.10 오후 11:59',
          status: '진행중',
          kjkey: '',
          seq: '6444455',
        },
      ],
      [
        {
          title: '5주차 수업과제',
          course: '비즈니스영어(01)',
          category: 'report',
          dDay: '',
          deadline: '2026.04.10 오후 11:59',
          status: '진행중',
          kjkey: 'A20261CAI3100101',
          seq: '6444455',
        },
      ],
    );

    expect(merged).toEqual([
      {
        title: '5주차 수업과제',
        course: '비즈니스영어',
        category: 'report',
        dDay: 'D-0',
        deadline: '2026.04.10 오후 11:59',
        status: '진행중',
        kjkey: 'A20261CAI3100101',
        seq: '6444455',
      },
    ]);
  });
});

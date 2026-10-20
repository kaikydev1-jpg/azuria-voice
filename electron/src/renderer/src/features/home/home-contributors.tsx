import type { CSSProperties, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getBridge } from '@/components/bridge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runRendererTask } from '@/lib/global-error-recovery';
import { homeContributors } from './home-contributors-data';

function openProfile(event: MouseEvent<HTMLAnchorElement>) {
  const bridge = getBridge();
  if (!bridge) return;
  event.preventDefault();
  const href = event.currentTarget.href;
  runRendererTask('Open contributor profile', () => bridge.files.openExternal(href));
}

/** Home contributor credits: every qualifying avatar, then the All link. */
export function HomeContributors() {
  const { t } = useTranslation();
  // Fill three tapered rows from the right edge, ending with All.
  const items = [...homeContributors, { login: 'all', avatar: '' }];
  const topCount = Math.ceil((items.length + 3) / 3);
  const middleCount = Math.ceil((items.length - topCount + 1) / 2);
  const starts = [0, topCount, topCount + middleCount];
  return (
    <ul
      className="home-contributors"
      aria-label={t('homeUi.allContributors')}
      style={{ '--contributor-columns': topCount * 2 } as CSSProperties}
    >
      {items.map(({ login, avatar }, index) => {
        const row = index < starts[1] ? 0 : index < starts[2] ? 1 : 2;
        const start = starts[row];
        const portrait = (
          <span className="home-contributor-avatar">
            {login === 'all' ? (
              <span className="home-contributor-all">{t('homeUi.all')}</span>
            ) : (
              <img src={avatar} alt="" width={44} height={44} />
            )}
          </span>
        );
        return (
          <li
            key={login}
            style={{
              gridRow: row + 1,
              gridColumn: `${topCount * 2 - 1 - (index - start) * 2} / span 2`,
            }}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    className="home-contributor"
                    href={
                      login === 'all'
                        ? 'https://github.com/debpalash/VoiceStudio/graphs/contributors'
                        : `https://github.com/${login}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={
                      login === 'all' ? t('homeUi.allContributors') : `GitHub · @${login}`
                    }
                    onClick={openProfile}
                  />
                }
              >
                {portrait}
              </TooltipTrigger>
              <TooltipContent surface="theme" side="bottom">
                {login === 'all' ? t('homeUi.allContributors') : `@${login}`}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

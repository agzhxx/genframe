'use client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useStaticSearch } from 'fumadocs-core/search/client';
import { basePath } from '@/lib/site';

export default function DefaultSearchDialog(props: SharedProps) {
  // The index is a static file (app/api/search/route.ts); Next.js doesn't add the base path
  // to fetch() URLs, so it's added here.
  const search = useStaticSearch({ from: `${basePath}/api/search` });

  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          {/* Its name starts with what it shows, so voice control finds it by "Esc" (WCAG 2.5.3);
              Fumadocs names it "Close Search". */}
          <SearchDialogClose aria-label="Esc: close search">Esc</SearchDialogClose>
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}

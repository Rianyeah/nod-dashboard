import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileImage as FileImageIcon,
  LoaderCircle as CircleNotchIcon,
} from 'lucide-react';

export default function RfTiltExportButton({ targetRef, disabled }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!targetRef?.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(targetRef.current, {
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--bg-base')
          .trim() || '#12141C',
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => {
          if (node?.classList?.contains('rf-export-control')) return false;
          return true;
        },
      });
      const link = document.createElement('a');
      link.download = `rf-tilt-analysis-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="rf-export-control"
      onClick={handleExport}
      disabled={disabled || exporting}
    >
      {exporting ? (
        <>
          <CircleNotchIcon className="animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <FileImageIcon />
          Export PNG
        </>
      )}
    </Button>
  );
}

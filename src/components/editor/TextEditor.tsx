import { useState, useCallback } from 'react'
import type { OCRResult, TextBlock } from '../../types/ocr'
import { downloadText, copyToClipboard } from '../../utils/textExport'

interface TextEditorProps {
  result: OCRResult | null
  results: OCRResult[]
  selectedBlock: TextBlock | null
  selectedPageBlockText: string | null
  lang: 'ja' | 'en'
  onTextChange?: (text: string) => void
}

export function TextEditor({
  result,
  results,
  selectedBlock,
  selectedPageBlockText,
  lang,
  onTextChange,
}: TextEditorProps) {
  const [editedText, setEditedText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [includeFileName, setIncludeFileName] = useState(false)
  const [ignoreNewlines, setIgnoreNewlines] = useState(false)

  // editedText が null なら result.fullText を使う
  const displayText = editedText ?? result?.fullText ?? ''

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setEditedText(newText)
      onTextChange?.(newText)
    },
    [onTextChange],
  )

  // result が変わったら編集状態をリセット
  const [prevResultId, setPrevResultId] = useState<string | null>(null)
  if (result && result.id !== prevResultId) {
    setPrevResultId(result.id)
    setEditedText(null)
  }

  const applyOptions = (text: string) =>
    ignoreNewlines ? text.replace(/\n/g, '') : text

  const buildText = (r: OCRResult) =>
    applyOptions(includeFileName ? `=== ${r.fileName} ===\n${r.fullText}` : r.fullText)

  const handleCopy = async () => {
    const text = applyOptions(displayText)
    try {
      await copyToClipboard(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleDownload = () => {
    if (!result) return
    const text = applyOptions(editedText ?? result.fullText)
    downloadText(
      includeFileName ? `=== ${result.fileName} ===\n${text}` : text,
      result.fileName,
    )
  }

  const handleDownloadAll = () => {
    if (results.length === 0) return
    const allText = results.map((r) => buildText(r)).join('\n\n')
    downloadText(allText, 'ocr_results')
  }

  if (!result) {
    return (
      <div className="text-editor empty">
        <p>{lang === 'ja' ? '結果なし' : 'No results'}</p>
      </div>
    )
  }

  return (
    <div className="text-editor">
      {/* ヘッダー: ファイル名と統計 */}
      <div className="text-editor-header">
        <span className="text-editor-filename">{result.fileName}</span>
        <span className="text-editor-stats">
          {result.textBlocks.length}
          {lang === 'ja' ? ' 領域' : ' regions'}
          {' · '}
          {(result.processingTimeMs / 1000).toFixed(1)}s
        </span>
      </div>

      {/* 選択ブロックの表示 */}
      {selectedPageBlockText != null && (
        <div className="text-editor-selection">
          <div className="text-editor-selection-label">
            {lang === 'ja' ? 'ブロック内のテキスト:' : 'Block text:'}
          </div>
          <div className="text-editor-selection-text">{selectedPageBlockText || '(空)'}</div>
        </div>
      )}
      {selectedBlock && selectedPageBlockText == null && (
        <div className="text-editor-selection">
          <div className="text-editor-selection-label">
            {lang === 'ja' ? '選択領域のテキスト:' : 'Selected region:'}
          </div>
          <div className="text-editor-selection-text">{selectedBlock.text || '(空)'}</div>
        </div>
      )}

      {/* 編集可能テキストエリア */}
      <div className="text-editor-body">
        {result.textBlocks.length === 0 ? (
          <p className="text-editor-empty-text">
            {lang === 'ja' ? 'テキストが検出されませんでした' : 'No text detected'}
          </p>
        ) : (
          <textarea
            className="text-editor-textarea"
            value={displayText}
            onChange={handleTextChange}
            spellCheck={false}
          />
        )}
      </div>

      {/* アクションバー */}
      <div className="text-editor-actions">
        <div className="text-editor-options">
          <label className="text-editor-option">
            <input
              type="checkbox"
              checked={includeFileName}
              onChange={(e) => setIncludeFileName(e.target.checked)}
            />
            {lang === 'ja' ? 'ファイル名を記載' : 'Include filename'}
          </label>
          <label className="text-editor-option">
            <input
              type="checkbox"
              checked={ignoreNewlines}
              onChange={(e) => setIgnoreNewlines(e.target.checked)}
            />
            {lang === 'ja' ? '改行を無視' : 'Ignore newlines'}
          </label>
        </div>
        <div className="text-editor-buttons">
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied
              ? lang === 'ja' ? 'コピーしました！' : 'Copied!'
              : lang === 'ja' ? 'コピー' : 'Copy'}
          </button>
          <button className="btn btn-secondary" onClick={handleDownload}>
            {lang === 'ja' ? 'ダウンロード' : 'Download'}
          </button>
          {results.length > 1 && (
            <button className="btn btn-secondary" onClick={handleDownloadAll}>
              {lang === 'ja' ? '全てDL' : 'Download All'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

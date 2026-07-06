import type { ChangeEvent } from 'react';
import { t } from '../../i18n/config';
import './Uploader.css';

interface Props {
    onUpload: (file: File) => void;
}

export default function Uploader({ onUpload }: Props) {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
    };

    return (
        <div className="uploader-container">
            <label className="upload-box">
                <span>{t('upload_prompt')}</span>
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleChange}
                    hidden
                />
            </label>
        </div>
    );
}
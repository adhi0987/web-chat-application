import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, footerActions }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4>{title}</h4>
          <button onClick={onClose} className="close-icon-btn"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footerActions && (
          <div className="modal-actions">
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );
}
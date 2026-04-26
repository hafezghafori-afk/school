import React from 'react';
import './Loader.css';

function Loader({ label = 'در حال بارگذاری...' }) {
  return (
    <div className="loader-wrap">
      <div className="loader-ring" />
      <span>{label}</span>
    </div>
  );
}

export default Loader;

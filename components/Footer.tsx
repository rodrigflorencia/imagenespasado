/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';



const Footer = () => {
    const [index, setIndex] = useState(0);

    

    return (
        <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-3 z-50 text-slate-600 text-xs sm:text-sm border-t border-slate-200">
            <div className="max-w-screen-xl mx-auto flex justify-between items-center gap-4 px-4">
                {/* Left Side */}
                <div className="hidden md:flex items-center gap-4 text-slate-500 whitespace-nowrap">
                    <p>Gemini Flash Image Preview</p>
                    <span className="text-slate-300" aria-hidden="true">|</span>
                    <p>
                        Created by{' '}
                        <a
                            href="https://"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-600 hover:text-slate-800 transition-colors duration-200 font-medium"
                        >
                            Flor
                        </a>
                    </p>
                </div>

            </div>
        </footer>
    );
};

export default Footer;

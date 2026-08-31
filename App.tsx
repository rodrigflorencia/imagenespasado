import React, { useState, ChangeEvent, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateDecadeImage } from './services/geminiService';
import PolaroidCard from './components/PolaroidCard';
import { createAlbumPage } from './lib/albumUtils';
import Footer from './components/Footer';

const AVAILABLE_DECADES = ['1130s', '1430s', '1720s', '1810s', '1850s', '1920s', '1960s', '1980s', '1990s', '2010s'];

const POSITIONS = [
    { top: '5%', left: '10%', rotate: -8 },
    { top: '15%', left: '60%', rotate: 8 },
    { top: '15%', left: '30%', rotate: 3 },
];

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-sans font-medium text-lg text-center text-white bg-slate-700 py-3 px-8 rounded-lg transform transition-all duration-200 hover:bg-slate-600 hover:shadow-md";
const secondaryButtonClasses = "font-sans font-medium text-lg text-center text-slate-700 bg-slate-100 border-2 border-slate-200 py-3 px-8 rounded-lg transform transition-all duration-200 hover:bg-slate-200 hover:shadow-md";

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        const listener = () => setMatches(media.matches);
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    }, [matches, query]);
    return matches;
};

function App() {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [selectedDecades, setSelectedDecades] = useState<string[]>([]);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'decades-selection' | 'generating' | 'results-shown'>('idle');
    const dragAreaRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');


    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('decades-selection');
                setGeneratedImages({}); 
                setSelectedDecades([]);
            };
            reader.readAsDataURL(file);
        }

    };

    const handleDecadeToggle = (decade: string) => {
        setSelectedDecades(prev => {
            if (prev.includes(decade)) {
                return prev.filter(d => d !== decade);
            } else if (prev.length < 3) {
                return [...prev, decade];
            }
            return prev;
        });
    };

    const handleConfirmDecades = () => {
        if (selectedDecades.length > 0) {
            setAppState('image-uploaded');
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        selectedDecades.forEach(decade => {
            initialImages[decade] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2; // Process two decades at a time
        const decadesQueue = [...selectedDecades];

        const processDecade = async (decade: string) => {
            try {
                const prompt = `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`;
                const resultUrl = await generateDecadeImage(uploadedImage, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'error', error: errorMessage },
                }));
                console.error(`Failed to generate image for ${decade}:`, err);
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (decadesQueue.length > 0) {
                const decade = decadesQueue.shift();
                if (decade) {
                    await processDecade(decade);
                }
            }
        });

        await Promise.all(workers);

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateDecade = async (decade: string) => {
        if (!uploadedImage) return;

        // Prevent re-triggering if a generation is already in progress
        if (generatedImages[decade]?.status === 'pending') {
            return;
        }
        
        console.log(`Regenerating image for ${decade}...`);

        // Set the specific decade to 'pending' to show the loading spinner
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));

        // Call the generation service for the specific decade
        try {
            const prompt = `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`;
            const resultUrl = await generateDecadeImage(uploadedImage, prompt);
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'error', error: errorMessage },
            }));
            console.error(`Failed to regenerate image for ${decade}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setAppState('idle');
    };

    const handleDownloadIndividualImage = (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `past-forward-${decade}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => image.status === 'done' && image.url)
                .reduce((acc, [decade, image]) => {
                    acc[decade] = image!.url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < selectedDecades.length) {
                alert("Please wait for all images to finish generating before downloading the album.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'past-forward-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <main className="bg-white text-slate-800 min-h-screen w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-slate-800">Viaje al pasado</h1>
                    <p className="font-sans text-slate-600 mt-2 text-lg tracking-wide font-light">Tu foto décadas atrás.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {/* Ghost polaroids for intro animation */}
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 h-[26rem] rounded-md p-4 bg-neutral-100/10 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                     caption="Clic para empezar"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 font-sans text-slate-600 text-center max-w-xs text-base font-light">
                                Clic en el polaroid para subir tu foto y comenzar el viaje al pasado.
                            </p>
                        </motion.div>
                    </div>
                )}

                {appState === 'decades-selection' && uploadedImage && (
                    <div className="flex flex-col items-center gap-6">
                         <div className="flex items-start gap-8">
                             <label htmlFor="file-upload-decades" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                    imageUrl={uploadedImage} 
                                    caption="Tu foto" 
                                    status="done"
                                 />
                             </label>
                             <input id="file-upload-decades" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                             <div className="flex flex-col justify-start">
                                 <p className="text-slate-600 mb-4 font-sans font-medium">Elige hasta 3 décadas</p>
                                 <div className="grid grid-cols-2 gap-3 mb-6">
                                     {AVAILABLE_DECADES.map((decade) => (
                                         <button
                                             key={decade}
                                             onClick={() => handleDecadeToggle(decade)}
                                             className={`py-2 px-3 rounded-lg font-sans font-medium text-sm transition-all duration-200 ${
                                                 selectedDecades.includes(decade)
                                                     ? 'bg-slate-700 text-white shadow-md'
                                                     : 'bg-slate-100 text-slate-700 border-2 border-slate-200 hover:bg-slate-200'
                                             }`}
                                         >
                                             {decade}
                                         </button>
                                     ))}
                                 </div>
                                 <button 
                                    onClick={handleGenerateClick} 
                                    disabled={selectedDecades.length === 0}
                                    className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed mb-3`}
                                >
                                    Viajar
                                </button>
                                 <button onClick={handleReset} className={secondaryButtonClasses}>
                                    Cambiar foto
                                </button>
                             </div>
                         </div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <div className="flex flex-col items-center gap-6">
                         <PolaroidCard 
                            imageUrl={uploadedImage} 
                            caption="Tu foto" 
                            status="done"
                         />
                         <div className="flex items-center gap-4 mt-4">
                            <button onClick={handleReset} className={secondaryButtonClasses}>
                                Cambiar foto
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Viajar
                            </button>
                         </div>
                    </div>
                )}

                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        {isMobile ? (
                            <div className="w-full max-w-sm flex-1 overflow-y-auto mt-4 space-y-8 p-4">
                                {selectedDecades.map((decade) => (
                                    <div key={decade} className="flex justify-center">
                                         <PolaroidCard
                                            caption={decade}
                                            status={generatedImages[decade]?.status || 'pending'}
                                            imageUrl={generatedImages[decade]?.url}
                                            error={generatedImages[decade]?.error}
                                            onShake={handleRegenerateDecade}
                                            onDownload={handleDownloadIndividualImage}
                                            isMobile={isMobile}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div ref={dragAreaRef} className="relative w-full max-w-5xl h-[600px] mt-4">
                                {selectedDecades.map((decade, index) => {
                                    const { top, left, rotate } = POSITIONS[index];
                                    return (
                                        <motion.div
                                            key={decade}
                                            className="absolute cursor-grab active:cursor-grabbing"
                                            style={{ top, left }}
                                            initial={{ opacity: 0, scale: 0.5, y: 100, rotate: 0 }}
                                            animate={{ 
                                                opacity: 1, 
                                                scale: 1, 
                                                y: 0,
                                                rotate: `${rotate}deg`,
                                            }}
                                            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.15 }}
                                        >
                                            <PolaroidCard 
                                                dragConstraintsRef={dragAreaRef}
                                                caption={decade}
                                                status={generatedImages[decade]?.status || 'pending'}
                                                imageUrl={generatedImages[decade]?.url}
                                                error={generatedImages[decade]?.error}
                                                onShake={handleRegenerateDecade}
                                                onDownload={handleDownloadIndividualImage}
                                                isMobile={isMobile}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                         <div className="h-20 mt-4 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creando Album...' : 'Descargar Album'}
                                    </button>
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        De nuevo
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}

export default App;
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Icon from '@/components/ui/icon';

const Index = () => {
  const [notes, setNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [quality, setQuality] = useState('360p');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const getVideoConstraints = (quality: string) => {
    const constraints = {
      '360p': { width: 640, height: 360 },
      '480p': { width: 640, height: 480 },
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 }
    };
    return constraints[quality as keyof typeof constraints] || constraints['360p'];
  };

  const startCamera = async () => {
    try {
      const constraints = getVideoConstraints(quality);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...constraints,
          facingMode: { exact: 'environment' }
        },
        audio: true
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Ошибка доступа к камере:', error);
      try {
        const constraints = getVideoConstraints(quality);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: constraints,
          audio: true
        });
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (fallbackError) {
        console.error('Ошибка доступа к камере (fallback):', fallbackError);
        alert('Не удается получить доступ к камере. Проверьте разрешения.');
      }
    }
  };

  const startRecording = async () => {
    if (!streamRef.current) {
      await startCamera();
    }

    if (streamRef.current) {
      chunksRef.current = [];
      
      // Используем самые совместимые кодеки для iOS/Android/Telegram
      const codecOptions = [
        // H.264 + AAC - лучшая совместимость
        { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 },
        // WebM + VP8 + Opus - распространенный fallback
        { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 },
        // WebM + VP9 + Opus - современные браузеры
        { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 },
        // Простой WebM - минимальные требования
        { mimeType: 'video/webm', videoBitsPerSecond: 2500000 }
      ];
      
      let selectedOptions = codecOptions[codecOptions.length - 1]; // fallback
      
      // Находим первый поддерживаемый кодек
      for (const option of codecOptions) {
        if (MediaRecorder.isTypeSupported(option.mimeType)) {
          selectedOptions = option;
          break;
        }
      }
      
      const mediaRecorder = new MediaRecorder(streamRef.current, selectedOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(chunksRef.current, { type: selectedOptions.mimeType });
        setRecordedVideo(videoBlob);
        setVideoUrl(URL.createObjectURL(videoBlob));
        stopCamera();
      };

      // Записываем данные каждые 1000мс для предотвращения потери данных
      mediaRecorder.start(1000);
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const retakeVideo = () => {
    setRecordedVideo(null);
    setVideoUrl('');
    startCamera();
  };

  const sendToTelegram = async () => {
    if (!recordedVideo || !notes.trim()) {
      alert('Пожалуйста, добавьте комментарий и запишите видео');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      // Отправляем как документ (файл для скачивания) в формате MP4
      formData.append('document', recordedVideo, 'video.mp4');
      formData.append('caption', `Комментарии: ${notes}`);
      formData.append('chat_id', '1385617271');

      // Создаем XMLHttpRequest для отслеживания прогресса
      const xhr = new XMLHttpRequest();
      
      // Отслеживаем прогресс загрузки
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      const response = await new Promise<Response>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(new Response(xhr.responseText, {
              status: xhr.status,
              statusText: xhr.statusText
            }));
          } else {
            reject(new Error(`HTTP Error: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network Error'));
        
        xhr.open('POST', `https://api.telegram.org/bot8388488803:AAEUt-LP2ngdCOx5entO1USCza-3tSrVL8I/sendDocument`);
        xhr.send(formData);
      });

      if (response.ok) {
        setIsSubmitted(true);
      } else {
        throw new Error('Ошибка отправки в Telegram');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка при отправке. Попробуйте еще раз.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const createNewLead = () => {
    setIsSubmitted(false);
    setNotes('');
    setRecordedVideo(null);
    setVideoUrl('');
    setIsRecording(false);
    stopCamera();
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-6">
          <div className="space-y-4">
            <Icon name="CheckCircle" size={64} className="text-primary mx-auto" />
            <h2 className="text-2xl font-bold text-card-foreground">Лид отправлен!</h2>
            <p className="text-muted-foreground">Ваше видео и комментарии успешно отправлены</p>
          </div>
          <Button 
            onClick={createNewLead}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            size="lg"
          >
            Создать новый лид
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary">
      <div className="container mx-auto p-4 space-y-6">
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold text-card-foreground mb-2">Создание лида</h1>
          <p className="text-muted-foreground">Добавьте комментарии и запишите видео</p>
        </div>

        <div className="grid gap-6 max-w-2xl mx-auto">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Icon name="NotebookPen" size={20} className="text-primary" />
                <Label htmlFor="notes" className="text-lg font-medium">Комментарии</Label>
              </div>
              <Textarea
                id="notes"
                placeholder="Введите ваши комментарии..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-32 resize-none"
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Icon name="Video" size={20} className="text-primary" />
                <Label className="text-lg font-medium">Запись видео</Label>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label htmlFor="quality" className="text-sm font-medium">Качество:</Label>
                  <Select value={quality} onValueChange={setQuality} disabled={isRecording}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="360p">360p</SelectItem>
                      <SelectItem value="480p">480p</SelectItem>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative bg-black rounded-lg aspect-video overflow-hidden">
                  {recordedVideo ? (
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Заглушка поверх видео во время записи */}
                      {(isRecording || streamRef.current) && (
                        <div className="absolute inset-0">
                          <img 
                            src="/img/6fa58b27-f2ff-417c-9f0b-978fdb1bfaa8.jpg"
                            alt="Заглушка видео"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </>
                  )}
                  
                  {!recordedVideo && !streamRef.current && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Icon name="Camera" size={48} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm opacity-75">Камера не активна</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-center">
                  {!recordedVideo ? (
                    <>
                      {!isRecording ? (
                        <Button 
                          onClick={startRecording}
                          className="bg-red-500 hover:bg-red-600 text-white"
                          size="lg"
                        >
                          <Icon name="Circle" size={16} className="mr-2" />
                          Начать запись
                        </Button>
                      ) : (
                        <Button 
                          onClick={stopRecording}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          size="lg"
                        >
                          <Icon name="Square" size={16} className="mr-2" />
                          Остановить
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button 
                      onClick={retakeVideo}
                      variant="outline"
                      size="lg"
                    >
                      <Icon name="RotateCcw" size={16} className="mr-2" />
                      Пересъемка
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {recordedVideo && (
            <div className="space-y-4">
              {/* Прогресс-бар загрузки */}
              {isUploading && (
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Отправка видео...</span>
                      <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      >
                        <div className="h-full w-full bg-gradient-to-r from-primary/50 to-primary animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
              
              <Button 
                onClick={sendToTelegram}
                disabled={isUploading || !notes.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                size="lg"
              >
                {isUploading ? (
                  <>
                    <Icon name="Loader2" size={16} className="mr-2 animate-spin" />
                    Отправка... {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Icon name="Send" size={16} className="mr-2" />
                    Отправить лид
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Upload, 
  Trash2, 
  Edit, 
  Star, 
  StarOff, 
  Download, 
  Plus,
  Image as ImageIcon,
  Type,
  QrCode,
  Settings,
  Move,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  GripVertical
} from "lucide-react";

// Font family options
const FONT_FAMILIES = [
  { value: "normal", label: "خط عادي", fontFamily: "Arial, sans-serif" },
  { value: "clear", label: "خط واضح للطباعة", fontFamily: "'Courier New', monospace" },
  { value: "digital", label: "خط رقمي (Digital)", fontFamily: "'DSEG7 Classic', 'Courier New', monospace" },
];

// Template type from API
interface Template {
  id: number;
  name: string;
  imageUrl: string;
  isDefault: boolean;
  usernameX: number;
  usernameY: number;
  usernameFontSize: number;
  usernameFontFamily: "normal" | "clear" | "digital";
  usernameFontColor: string;
  usernameAlign: "left" | "center" | "right";
  passwordX: number;
  passwordY: number;
  passwordFontSize: number;
  passwordFontFamily: "normal" | "clear" | "digital";
  passwordFontColor: string;
  passwordAlign: "left" | "center" | "right";
  qrCodeEnabled: boolean;
  qrCodeX: number;
  qrCodeY: number;
  qrCodeSize: number;
  qrCodeDomain: string | null;
  cardWidth: number;
  cardHeight: number;
  cardsPerPage: number;
  marginTop: string;
  marginHorizontal: string;
  columnsPerPage: number;
}

export default function CardTemplates() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch templates
  const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();
  
  // Mutations
  const createMultiple = trpc.templates.createMultiple.useMutation({
    onSuccess: () => {
      toast.success("تم رفع القوالب بنجاح");
      refetch();
      setUploadDialogOpen(false);
      setUploadFiles([]);
    },
    onError: (error) => {
      toast.error(`فشل رفع القوالب: ${error.message}`);
    },
  });

  const updateTemplate = trpc.templates.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث القالب بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل تحديث القالب: ${error.message}`);
    },
  });

  const deleteTemplate = trpc.templates.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف القالب بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل حذف القالب: ${error.message}`);
    },
  });

  const setDefault = trpc.templates.setDefault.useMutation({
    onSuccess: () => {
      toast.success("تم تعيين القالب كافتراضي");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل تعيين القالب كافتراضي: ${error.message}`);
    },
  });

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadFiles(prev => [...prev, ...files]);
  };

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setUploadFiles(prev => [...prev, ...files]);
  }, []);

  // Upload files
  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    
    setUploading(true);
    try {
      const templatesData = await Promise.all(
        uploadFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          const name = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
          return {
            name,
            imageBase64: base64,
            imageType: file.type,
          };
        })
      );
      
      await createMultiple.mutateAsync(templatesData);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // Remove file from upload list
  const removeFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Open edit dialog
  const openEditDialog = (template: Template) => {
    setSelectedTemplate(template);
    setEditDialogOpen(true);
  };

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">قوالب البطاقات</h1>
            <p className="text-muted-foreground">إدارة قوالب تصميم البطاقات للطباعة</p>
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            رفع قوالب جديدة
          </Button>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-muted" />
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="overflow-hidden group">
                <div className="relative aspect-video bg-muted">
                  <img
                    src={template.imageUrl}
                    alt={template.name}
                    className="w-full h-full object-contain"
                  />
                  {template.isDefault && (
                    <Badge className="absolute top-2 right-2 bg-yellow-500">
                      <Star className="h-3 w-3 ml-1" />
                      افتراضي
                    </Badge>
                  )}
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEditDialog(template as Template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDefault.mutate({ id: template.id })}
                      disabled={template.isDefault || false}
                    >
                      {template.isDefault ? (
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      ) : (
                        <StarOff className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (await window.confirmOperation("هل أنت متأكد من حذف هذا القالب؟", "حذف القالب")) {
                          deleteTemplate.mutate({ id: template.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium truncate">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {template.cardWidth} × {template.cardHeight} بكسل
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">لا توجد قوالب</h3>
            <p className="text-muted-foreground mb-4">
              قم برفع صور قوالب البطاقات لبدء استخدامها في الطباعة
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="ml-2 h-4 w-4" />
              رفع قوالب
            </Button>
          </Card>
        )}

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>رفع قوالب بطاقات جديدة</DialogTitle>
              <DialogDescription>
                يمكنك رفع عدة صور دفعة واحدة. سيتم استخدام اسم الملف كاسم للقالب.
              </DialogDescription>
            </DialogHeader>

            {/* Drop zone */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">اسحب وأفلت الصور هنا</p>
              <p className="text-sm text-muted-foreground">أو انقر لاختيار الملفات</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Selected files */}
            {uploadFiles.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {uploadFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 bg-muted rounded-lg"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-10 w-16 object-cover rounded"
                    />
                    <span className="flex-1 truncate text-sm">{file.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                إلغاء
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploadFiles.length === 0 || uploading}
              >
                {uploading ? "جاري الرفع..." : `رفع ${uploadFiles.length} قالب`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Template Dialog */}
        {selectedTemplate && (
          <TemplateEditorDialog
            template={selectedTemplate}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSave={(data) => {
              const cleanData = {
                ...data,
                qrCodeDomain: data.qrCodeDomain ?? undefined,
              };
              updateTemplate.mutate({ id: selectedTemplate.id, ...cleanData });
              setEditDialogOpen(false);
            }}
          />
        )}
      </div>
  );
}

// Template Editor Dialog Component
interface TemplateEditorDialogProps {
  template: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Template>) => void;
}

function TemplateEditorDialog({ template, open, onOpenChange, onSave }: TemplateEditorDialogProps) {
  const [name, setName] = useState(template.name);
  const [activeTab, setActiveTab] = useState("username");
  
  // Username settings
  const [usernameX, setUsernameX] = useState(template.usernameX);
  const [usernameY, setUsernameY] = useState(template.usernameY);
  const [usernameFontSize, setUsernameFontSize] = useState(template.usernameFontSize);
  const [usernameFontFamily, setUsernameFontFamily] = useState(template.usernameFontFamily);
  const [usernameFontColor, setUsernameFontColor] = useState(template.usernameFontColor);
  const [usernameAlign, setUsernameAlign] = useState(template.usernameAlign);
  
  // Password settings
  const [passwordX, setPasswordX] = useState(template.passwordX);
  const [passwordY, setPasswordY] = useState(template.passwordY);
  const [passwordFontSize, setPasswordFontSize] = useState(template.passwordFontSize);
  const [passwordFontFamily, setPasswordFontFamily] = useState(template.passwordFontFamily);
  const [passwordFontColor, setPasswordFontColor] = useState(template.passwordFontColor);
  const [passwordAlign, setPasswordAlign] = useState(template.passwordAlign);
  
  // QR Code settings
  const [qrCodeEnabled, setQrCodeEnabled] = useState(template.qrCodeEnabled);
  const [qrCodeX, setQrCodeX] = useState(template.qrCodeX);
  const [qrCodeY, setQrCodeY] = useState(template.qrCodeY);
  const [qrCodeSize, setQrCodeSize] = useState(template.qrCodeSize);
  const [qrCodeDomain, setQrCodeDomain] = useState(template.qrCodeDomain || "");
  
  // Print settings
  const [cardsPerPage, setCardsPerPage] = useState(template.cardsPerPage);
  const [marginTop, setMarginTop] = useState(parseFloat(template.marginTop));
  const [marginHorizontal, setMarginHorizontal] = useState(parseFloat(template.marginHorizontal));
  const [columnsPerPage, setColumnsPerPage] = useState(template.columnsPerPage);

  // Dragging state
  const [dragging, setDragging] = useState<"username" | "password" | "qrcode" | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Handle drag
  const handleMouseDown = (element: "username" | "password" | "qrcode") => {
    setDragging(element);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !previewRef.current) return;
    
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * template.cardWidth);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * template.cardHeight);
    
    if (dragging === "username") {
      setUsernameX(Math.max(0, Math.min(x, template.cardWidth)));
      setUsernameY(Math.max(0, Math.min(y, template.cardHeight)));
    } else if (dragging === "password") {
      setPasswordX(Math.max(0, Math.min(x, template.cardWidth)));
      setPasswordY(Math.max(0, Math.min(y, template.cardHeight)));
    } else if (dragging === "qrcode") {
      setQrCodeX(Math.max(0, Math.min(x, template.cardWidth)));
      setQrCodeY(Math.max(0, Math.min(y, template.cardHeight)));
    }
  }, [dragging, template.cardWidth, template.cardHeight]);

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Get font family CSS
  const getFontFamily = (family: string) => {
    return FONT_FAMILIES.find(f => f.value === family)?.fontFamily || "Arial, sans-serif";
  };

  // Save changes
  const handleSave = () => {
    onSave({
      name,
      usernameX,
      usernameY,
      usernameFontSize,
      usernameFontFamily,
      usernameFontColor,
      usernameAlign,
      passwordX,
      passwordY,
      passwordFontSize,
      passwordFontFamily,
      passwordFontColor,
      passwordAlign,
      qrCodeEnabled,
      qrCodeX,
      qrCodeY,
      qrCodeSize,
      qrCodeDomain: qrCodeDomain || "",
      cardsPerPage,
      marginTop: marginTop.toString(),
      marginHorizontal: marginHorizontal.toString(),
      columnsPerPage,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل القالب</DialogTitle>
          <DialogDescription>
            قم بتعديل إعدادات القالب ومواضع النصوص
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Preview */}
          <div className="space-y-4">
            <Label>معاينة البطاقة</Label>
            <div
              ref={previewRef}
              className="relative border rounded-lg overflow-hidden cursor-crosshair select-none"
              style={{ aspectRatio: `${template.cardWidth}/${template.cardHeight}` }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                src={template.imageUrl}
                alt={template.name}
                className="w-full h-full object-contain"
                draggable={false}
              />
              
              {/* Username text */}
              <div
                className="absolute cursor-move flex items-center gap-1"
                style={{
                  left: `${(usernameX / template.cardWidth) * 100}%`,
                  top: `${(usernameY / template.cardHeight) * 100}%`,
                  fontSize: `${usernameFontSize * 0.8}px`,
                  fontFamily: getFontFamily(usernameFontFamily),
                  color: usernameFontColor,
                  textAlign: usernameAlign,
                }}
                onMouseDown={() => handleMouseDown("username")}
              >
                <GripVertical className="h-3 w-3 opacity-50" />
                <span>12345678</span>
              </div>
              
              {/* Password text */}
              <div
                className="absolute cursor-move flex items-center gap-1"
                style={{
                  left: `${(passwordX / template.cardWidth) * 100}%`,
                  top: `${(passwordY / template.cardHeight) * 100}%`,
                  fontSize: `${passwordFontSize * 0.8}px`,
                  fontFamily: getFontFamily(passwordFontFamily),
                  color: passwordFontColor,
                  textAlign: passwordAlign,
                }}
                onMouseDown={() => handleMouseDown("password")}
              >
                <GripVertical className="h-3 w-3 opacity-50" />
                <span>1234</span>
              </div>
              
              {/* QR Code placeholder */}
              {qrCodeEnabled && (
                <div
                  className="absolute cursor-move border-2 border-dashed border-gray-400 bg-white/80 flex items-center justify-center"
                  style={{
                    left: `${(qrCodeX / template.cardWidth) * 100}%`,
                    top: `${(qrCodeY / template.cardHeight) * 100}%`,
                    width: `${(qrCodeSize / template.cardWidth) * 100}%`,
                    height: `${(qrCodeSize / template.cardHeight) * 100}%`,
                  }}
                  onMouseDown={() => handleMouseDown("qrcode")}
                >
                  <QrCode className="h-6 w-6 text-gray-400" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              اسحب العناصر لتغيير موضعها على البطاقة
            </p>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            {/* Template name */}
            <div className="space-y-2">
              <Label>اسم القالب</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: بطاقة ساعة"
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="username">
                  <Type className="h-4 w-4 ml-1" />
                  المستخدم
                </TabsTrigger>
                <TabsTrigger value="password">
                  <Type className="h-4 w-4 ml-1" />
                  كلمة السر
                </TabsTrigger>
                <TabsTrigger value="qrcode">
                  <QrCode className="h-4 w-4 ml-1" />
                  QR
                </TabsTrigger>
                <TabsTrigger value="print">
                  <Settings className="h-4 w-4 ml-1" />
                  الطباعة
                </TabsTrigger>
              </TabsList>

              {/* Username Tab */}
              <TabsContent value="username" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>الموضع X</Label>
                    <Input
                      type="number"
                      value={usernameX}
                      onChange={(e) => setUsernameX(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الموضع Y</Label>
                    <Input
                      type="number"
                      value={usernameY}
                      onChange={(e) => setUsernameY(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>حجم الخط: {usernameFontSize}px</Label>
                  <Slider
                    value={[usernameFontSize]}
                    onValueChange={([v]) => setUsernameFontSize(v)}
                    min={8}
                    max={48}
                    step={1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>نوع الخط</Label>
                  <Select value={usernameFontFamily} onValueChange={(v: any) => setUsernameFontFamily(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILIES.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          <span style={{ fontFamily: font.fontFamily }}>{font.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>اللون</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={usernameFontColor}
                      onChange={(e) => setUsernameFontColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={usernameFontColor}
                      onChange={(e) => setUsernameFontColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>المحاذاة</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={usernameAlign === "right" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUsernameAlign("right")}
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={usernameAlign === "center" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUsernameAlign("center")}
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={usernameAlign === "left" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUsernameAlign("left")}
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Password Tab */}
              <TabsContent value="password" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>الموضع X</Label>
                    <Input
                      type="number"
                      value={passwordX}
                      onChange={(e) => setPasswordX(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الموضع Y</Label>
                    <Input
                      type="number"
                      value={passwordY}
                      onChange={(e) => setPasswordY(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>حجم الخط: {passwordFontSize}px</Label>
                  <Slider
                    value={[passwordFontSize]}
                    onValueChange={([v]) => setPasswordFontSize(v)}
                    min={8}
                    max={48}
                    step={1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>نوع الخط</Label>
                  <Select value={passwordFontFamily} onValueChange={(v: any) => setPasswordFontFamily(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILIES.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          <span style={{ fontFamily: font.fontFamily }}>{font.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>اللون</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={passwordFontColor}
                      onChange={(e) => setPasswordFontColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={passwordFontColor}
                      onChange={(e) => setPasswordFontColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>المحاذاة</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={passwordAlign === "right" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPasswordAlign("right")}
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={passwordAlign === "center" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPasswordAlign("center")}
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={passwordAlign === "left" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPasswordAlign("left")}
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* QR Code Tab */}
              <TabsContent value="qrcode" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>تفعيل QR Code</Label>
                  <Switch
                    checked={qrCodeEnabled}
                    onCheckedChange={setQrCodeEnabled}
                  />
                </div>
                
                {qrCodeEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>الموضع X</Label>
                        <Input
                          type="number"
                          value={qrCodeX}
                          onChange={(e) => setQrCodeX(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الموضع Y</Label>
                        <Input
                          type="number"
                          value={qrCodeY}
                          onChange={(e) => setQrCodeY(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>حجم QR Code: {qrCodeSize}px</Label>
                      <Slider
                        value={[qrCodeSize]}
                        onValueChange={([v]) => setQrCodeSize(v)}
                        min={40}
                        max={200}
                        step={5}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>رابط QR Code (IP أو Domain)</Label>
                      <Input
                        value={qrCodeDomain}
                        onChange={(e) => setQrCodeDomain(e.target.value)}
                        placeholder="مثال: http://192.168.1.1/login"
                        dir="ltr"
                      />
                      <p className="text-xs text-muted-foreground">
                        سيتم إضافة اسم المستخدم وكلمة السر تلقائياً للرابط
                      </p>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Print Settings Tab */}
              <TabsContent value="print" className="space-y-4">
                <div className="space-y-2">
                  <Label>عدد الكروت في الصفحة</Label>
                  <Input
                    type="number"
                    value={cardsPerPage}
                    onChange={(e) => setCardsPerPage(parseInt(e.target.value) || 8)}
                    min={1}
                    max={20}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>عدد الأعمدة في الصفحة</Label>
                  <Input
                    type="number"
                    value={columnsPerPage}
                    onChange={(e) => setColumnsPerPage(parseInt(e.target.value) || 5)}
                    min={1}
                    max={10}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>الهوامش العلوية: {marginTop} سم</Label>
                  <Slider
                    value={[marginTop]}
                    onValueChange={([v]) => setMarginTop(v)}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>الهوامش الأفقية: {marginHorizontal} سم</Label>
                  <Slider
                    value={[marginHorizontal]}
                    onValueChange={([v]) => setMarginHorizontal(v)}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave}>
            حفظ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

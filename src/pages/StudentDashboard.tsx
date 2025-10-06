import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, QrCode, CheckCircle, XCircle, Calendar, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";

interface AttendanceRecord {
  id: string;
  timestamp: string;
  status: string;
  sessions: {
    subject: string;
    created_at: string;
  };
}

export default function StudentDashboard() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [userName, setUserName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadUserData();
    loadAttendance();
  }, []);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (scannerOpen && !scanning) {
      startScanner();
    }

    async function startScanner() {
      setScanning(true);
      html5QrCode = new Html5Qrcode("qr-reader");

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          onScanSuccess,
          undefined
        );
      } catch (err) {
        console.error("Error starting scanner:", err);
        toast.error("Failed to start camera. Please check permissions.");
        setScannerOpen(false);
        setScanning(false);
      }
    }

    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [scannerOpen]);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      
      setUserName(profile?.name || "Student");
    }
  };

  const loadAttendance = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("attendance")
      .select(`
        *,
        sessions(subject, created_at)
      `)
      .eq("student_id", user.id)
      .order("timestamp", { ascending: false });

    if (error) {
      toast.error("Error loading attendance");
    } else {
      setAttendance(data || []);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    setScanning(false);
    setScannerOpen(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Find the session with this QR token
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("*")
        .eq("qr_token", decodedText)
        .single();

      if (sessionError || !session) {
        toast.error("Invalid QR code");
        return;
      }

      // Check if session is still active
      if (new Date(session.expires_at) < new Date()) {
        toast.error("This session has expired");
        return;
      }

      // Check if already marked attendance
      const { data: existing } = await supabase
        .from("attendance")
        .select("id")
        .eq("session_id", session.id)
        .eq("student_id", user.id)
        .single();

      if (existing) {
        toast.error("You have already marked attendance for this session");
        return;
      }

      // Mark attendance
      const { error: attendanceError } = await supabase
        .from("attendance")
        .insert({
          session_id: session.id,
          student_id: user.id,
          status: "present",
        });

      if (attendanceError) throw attendanceError;

      toast.success(`Attendance marked for ${session.subject}!`);
      loadAttendance();
    } catch (error: any) {
      toast.error(error.message || "Error marking attendance");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const attendanceRate = attendance.length > 0 
    ? Math.round((attendance.filter(a => a.status === "present").length / attendance.length) * 100)
    : 0;

  return (
    <AuthGuard requiredRole="student">
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <QrCode className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Student Dashboard</h1>
                <p className="text-sm text-muted-foreground">Welcome, {userName}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleSignOut} size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Classes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{attendance.length}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">{attendanceRate}%</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Present</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {attendance.filter(a => a.status === "present").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scan QR Button */}
          <div className="mb-8">
            <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  className="w-full md:w-auto bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg"
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  Scan QR Code to Mark Attendance
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Scan QR Code</DialogTitle>
                  <DialogDescription>
                    Position the QR code within the frame
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Attendance History */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Attendance History</h2>
            
            {attendance.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No attendance records yet</h3>
                  <p className="text-muted-foreground text-center">
                    Scan a QR code to mark your first attendance
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {attendance.map((record) => (
                  <Card key={record.id} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          record.status === "present" 
                            ? "bg-accent/10 text-accent" 
                            : "bg-destructive/10 text-destructive"
                        }`}>
                          {record.status === "present" ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            <XCircle className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold">{record.sessions.subject}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(record.timestamp).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(record.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        record.status === "present"
                          ? "bg-accent/10 text-accent"
                          : "bg-destructive/10 text-destructive"
                      }`}>
                        {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, LogOut, QrCode, Users, BookOpen, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";

interface Session {
  id: string;
  subject: string;
  created_at: string;
  expires_at: string;
  qr_token: string;
  is_active: boolean;
  attendance?: { count: number }[];
}

export default function TeacherDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [userName, setUserName] = useState("");
  const navigate = useNavigate();

  const [newSession, setNewSession] = useState({
    subject: "",
    duration: 30,
  });

  useEffect(() => {
    loadUserData();
    loadSessions();
  }, []);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      
      setUserName(profile?.name || "Teacher");
    }
  };

  const loadSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("sessions")
      .select(`
        *,
        attendance(count)
      `)
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error loading sessions");
    } else {
      setSessions(data || []);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + newSession.duration);

      const qrToken = `${user.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { error } = await supabase
        .from("sessions")
        .insert({
          subject: newSession.subject,
          teacher_id: user.id,
          expires_at: expiresAt.toISOString(),
          qr_token: qrToken,
        });

      if (error) throw error;

      toast.success("Session created successfully!");
      setDialogOpen(false);
      setNewSession({ subject: "", duration: 30 });
      loadSessions();
    } catch (error: any) {
      toast.error(error.message || "Error creating session");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const showQRCode = (session: Session) => {
    setSelectedSession(session);
    setQrDialogOpen(true);
  };

  const getAttendanceCount = (session: Session) => {
    return session.attendance?.[0]?.count || 0;
  };

  return (
    <AuthGuard requiredRole="teacher">
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Teacher Dashboard</h1>
                <p className="text-sm text-muted-foreground">Welcome back, {userName}</p>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{sessions.length}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent">
                  {sessions.filter(s => new Date(s.expires_at) > new Date()).length}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {sessions.reduce((sum, s) => sum + getAttendanceCount(s), 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Create Session Button */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">My Sessions</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Session</DialogTitle>
                  <DialogDescription>Generate a QR code for student attendance</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateSession} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Name</Label>
                    <Input
                      id="subject"
                      placeholder="e.g., Mathematics 101"
                      value={newSession.subject}
                      onChange={(e) => setNewSession({ ...newSession, subject: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="5"
                      max="180"
                      value={newSession.duration}
                      onChange={(e) => setNewSession({ ...newSession, duration: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating..." : "Create Session"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Sessions List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => {
              const isActive = new Date(session.expires_at) > new Date();
              return (
                <Card key={session.id} className={`border-border/50 shadow-md hover:shadow-lg transition-shadow ${isActive ? 'border-l-4 border-l-accent' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{session.subject}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(session.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      {isActive && (
                        <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Attendance</span>
                      </div>
                      <span className="font-semibold">{getAttendanceCount(session)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Expires: {new Date(session.expires_at).toLocaleString()}
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => showQRCode(session)}
                      disabled={!isActive}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      View QR Code
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {sessions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <QrCode className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No sessions yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first session to generate a QR code for attendance
                </p>
              </CardContent>
            </Card>
          )}
        </main>

        {/* QR Code Dialog */}
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedSession?.subject}</DialogTitle>
              <DialogDescription>
                Students can scan this QR code to mark their attendance
              </DialogDescription>
            </DialogHeader>
            {selectedSession && (
              <div className="flex flex-col items-center gap-6 py-4">
                <div className="bg-white p-6 rounded-lg shadow-inner">
                  <QRCode value={selectedSession.qr_token} size={256} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Valid until: {new Date(selectedSession.expires_at).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Current attendance: {getAttendanceCount(selectedSession)} students
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
  Check,
  ChevronDown,
  Clock,
  Delete,
  Filter,
  ListCollapse,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  StopCircle,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { useInstance } from "@/contexts/InstanceContext";

import { api } from "@/lib/queries/api";
import { useFetchSessionsEvoai } from "@/lib/queries/evoai/fetchSessionsEvoai";
import { useManageEvoai } from "@/lib/queries/evoai/manageEvoai";

import { IntegrationSession } from "@/types/evolution.types";

interface FilterState {
  name: string;
  number: string;
  status: string;
  time: string;
  customTime?: {
    condition: "more" | "less";
    value: number;
    unit: "minutes" | "hours" | "days";
  };
}

function SessionsEvoai({ evoaiId }: { evoaiId?: string }) {
  const { t } = useTranslation();
  const { instance } = useInstance();

  const [open, setOpen] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    name: "",
    number: "",
    status: "all",
    time: "all",
  });
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState("opened");
  const [sessionsPerPage, setSessionsPerPage] = useState(9);
  const [sessionsDisplayed, setSessionsDisplayed] = useState(0);
  const [showBots, setShowBots] = useState(true);
  const [filteredSessions, setFilteredSessions] = useState<IntegrationSession[]>([]);
  const [sendMessageOpen, setSendMessageOpen] = useState(false);
  const [selectedSessionForMessage, setSelectedSessionForMessage] = useState<string>("");
  const [messageText, setMessageText] = useState("");

  const { data: sessions = [], refetch: refetchSessions } =
    useFetchSessionsEvoai({
      instanceName: instance?.name,
      evoaiId,
      enabled: !!instance?.name && !!evoaiId,
    });

  console.log("Hook result:", { 
    sessions, 
    instanceName: instance?.name, 
    evoaiId,
    enabled: !!instance?.name && !!evoaiId
    });

  const { changeStatusEvoai } = useManageEvoai();

  // Time filter functions
  const parseTimeFilter = (
    value: string,
    customValue?: number,
    customUnit?: string,
    customCondition?: string
  ) => {
    if (value === "custom") {
      if (!customValue || isNaN(customValue) || customValue <= 0) return null;
      const minutes = convertCustomTime(customValue, customUnit || "minutes");
      return { minutes, condition: customCondition };
    }

    if (!value || value === "all") return null;

    if (value.startsWith(">")) {
      const val = parseInt(value.slice(1));
      return { moreThan: val };
    } else {
      return parseInt(value);
    }
  };

  const convertCustomTime = (value: number, unit: string) => {
    if (unit === "minutes") return value;
    if (unit === "hours") return value * 60;
    if (unit === "days") return value * 1440;
    return null;
  };

  const checkTimeCondition = (diffMinutes: number, timeFilter: any) => {
    if (typeof timeFilter === "object" && timeFilter.moreThan !== undefined) {
      return diffMinutes > timeFilter.moreThan;
    } else if (
      typeof timeFilter === "object" &&
      timeFilter.minutes !== undefined &&
      timeFilter.condition
    ) {
      if (timeFilter.condition === "more") {
        return diffMinutes > timeFilter.minutes;
      } else {
        return diffMinutes <= timeFilter.minutes;
      }
    } else if (typeof timeFilter === "number") {
      return diffMinutes <= timeFilter;
    }
    return true;
  };

  // Apply filters
  const applyFilters = () => {
    const { name, number, status, time, customTime } = filterState;
    const parsedTime = parseTimeFilter(
      time,
      customTime?.value,
      customTime?.unit,
      customTime?.condition
    );

    const filtered = sessions.filter((session) => {
      const matchesName = session.pushName
        ?.toLowerCase()
        .includes(name.toLowerCase());
      const matchesNumber = session.remoteJid.includes(number);
      const matchesStatus = status === "all" || !status || session.status === status;

      let matchesTime = true;
      if (parsedTime !== null) {
        const diffMinutes =
          (Date.now() - new Date(session.updatedAt).getTime()) / 60000;
        matchesTime = checkTimeCondition(diffMinutes, parsedTime);
      }

      return matchesName && matchesNumber && matchesStatus && matchesTime;
    });

    setFilteredSessions(filtered);
    // Reset pagination to show first batch of filtered sessions
    setSessionsDisplayed(Math.min(sessionsPerPage, filtered.length));
  };

  // Mass actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all displayed sessions (filtered)
      setSelectedSessions(displayedSessions.map((s) => s.remoteJid));
    } else {
      setSelectedSessions([]);
    }
  };

  const handleMassStatusChange = async () => {
    if (selectedSessions.length === 0) {
      toast.error("Select at least one session.");
      return;
    }

    try {
      await Promise.all(
        selectedSessions.map((remoteJid) =>
          changeStatusEvoai({
            instanceName: instance?.name || "",
            token: instance?.token || "",
            remoteJid,
            status: newStatus,
          })
        )
      );

      toast.success("Status updated for selected sessions.");
      setSelectedSessions([]);
      refetchSessions();
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error?.response?.data?.response?.message}`);
    }
  };

  // Individual actions
  const changeStatus = async (remoteJid: string, status: string) => {
    try {
      if (!instance) return;

      await changeStatusEvoai({
        instanceName: instance.name,
        token: instance.token,
        remoteJid,
        status,
      });

      toast.success("Status changed successfully.");
      refetchSessions();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(`Error: ${error?.response?.data?.response?.message}`);
    }
  };

  const openSendMessageModal = (remoteJid: string) => {
    setSelectedSessionForMessage(remoteJid);
    setMessageText("");
    setSendMessageOpen(true);
  };

  const sendMessage = async () => {
    if (!messageText.trim()) {
      toast.error("Please enter a message.");
      return;
    }

    try {
      if (!instance) return;

      await api.post(`/message/sendText/${instance.name}`, {
        number: selectedSessionForMessage,
        text: messageText
      }, {
        headers: {
          apikey: instance.token
        }
      });

      toast.success("Message sent successfully.");
      setSendMessageOpen(false);
      setMessageText("");
      setSelectedSessionForMessage("");
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(`Error: ${error?.response?.data?.response?.message || error?.message || 'Failed to send message'}`);
    }
  };



  // Pagination
  const showMore = () => {
    setSessionsDisplayed((prev) => Math.min(prev + sessionsPerPage, filteredSessions.length));
  };

  const showAll = () => {
    setSessionsDisplayed(filteredSessions.length);
  };

  const showLess = () => {
    setSessionsDisplayed(Math.min(sessionsPerPage, filteredSessions.length));
  };

  // Initialize filtered sessions when sessions change
  useEffect(() => {
    console.log("Sessions changed:", sessions);
    if (sessions.length > 0) {
      setFilteredSessions(sessions);
      // Show first batch of sessions automatically
      setSessionsDisplayed(Math.min(sessionsPerPage, sessions.length));
      console.log("Filtered sessions set:", sessions.length);
    }
  }, [sessions, sessionsPerPage]);

  const displayedSessions = filteredSessions.slice(0, sessionsDisplayed);
  
  console.log("Debug info:", {
    sessionsCount: sessions.length,
    filteredCount: filteredSessions.length,
    displayedCount: displayedSessions.length,
    sessionsDisplayed,
    sessionsPerPage
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <ListCollapse size={16} className="mr-1" />
          <span className="hidden sm:inline">{t("evoai.sessions.label")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-7xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>EvoAI Sessions</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-6">
          <div className="space-y-6">
            {/* Debug Info */}
            <Card>
              <CardHeader>
                <CardTitle>Debug Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p>Instance: {instance?.name || "None"}</p>
                  <p>EvoAI ID: {evoaiId || "None"}</p>
                  <p>Sessions Count: {sessions.length}</p>
                  <p>Filtered Count: {filteredSessions.length}</p>
                  <p>Displayed Count: {displayedSessions.length}</p>
                  <Button onClick={() => refetchSessions()} size="sm">
                    Refetch Sessions
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Toggle Bots Button */}
            <Button
              variant="outline"
              onClick={() => setShowBots(!showBots)}
              className="w-full"
            >
              {showBots ? "Hide Available Bots" : "Show Available Bots"}
            </Button>

            {/* Advanced Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Advanced Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Name Filter</Label>
                    <Input
                      placeholder="Filter by name"
                      value={filterState.name}
                      onChange={(e) =>
                        setFilterState((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Number Filter</Label>
                    <Input
                      placeholder="Filter by number"
                      value={filterState.number}
                      onChange={(e) =>
                        setFilterState((prev) => ({ ...prev, number: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Status Filter</Label>
                    <Select
                      value={filterState.status}
                      onValueChange={(value) =>
                        setFilterState((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="opened">Opened</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Time Filter</Label>
                    <Select
                      value={filterState.time}
                      onValueChange={(value) =>
                        setFilterState((prev) => ({ ...prev, time: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Times</SelectItem>
                        <SelectItem value="5">Last 5 Minutes</SelectItem>
                        <SelectItem value="10">Last 10 Minutes</SelectItem>
                        <SelectItem value="15">Last 15 Minutes</SelectItem>
                        <SelectItem value="20">Last 20 Minutes</SelectItem>
                        <SelectItem value="30">Last 30 Minutes</SelectItem>
                        <SelectItem value="60">Last 60 Minutes</SelectItem>
                        <SelectItem value=">60">More than 60 Minutes</SelectItem>
                        <SelectItem value=">120">More than 2 Hours</SelectItem>
                        <SelectItem value=">300">More than 5 Hours</SelectItem>
                        <SelectItem value=">1440">More than 24 Hours</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
          </div>

                {/* Custom Time Filter */}
                {filterState.time === "custom" && (
                  <div className="flex gap-2 mt-4">
                    <Select
                      value={filterState.customTime?.condition || "more"}
                      onValueChange={(value: "more" | "less") =>
                        setFilterState((prev) => ({
                          ...prev,
                          customTime: {
                            condition: value,
                            value: prev.customTime?.value || 0,
                            unit: prev.customTime?.unit || "minutes",
                          },
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="more">More than</SelectItem>
                        <SelectItem value="less">Less than</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Value"
                      className="w-20"
                      value={filterState.customTime?.value || ""}
                      onChange={(e) =>
                        setFilterState((prev) => ({
                          ...prev,
                          customTime: {
                            condition: prev.customTime?.condition || "more",
                            value: parseInt(e.target.value) || 0,
                            unit: prev.customTime?.unit || "minutes",
                          },
                        }))
                      }
                    />
                    <Select
                      value={filterState.customTime?.unit || "minutes"}
                      onValueChange={(value: "minutes" | "hours" | "days") =>
                        setFilterState((prev) => ({
                          ...prev,
                          customTime: {
                            condition: prev.customTime?.condition || "more",
                            value: prev.customTime?.value || 0,
                            unit: value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={applyFilters} className="mt-4">
                  Apply Filters
                </Button>
              </CardContent>
            </Card>

            {/* Mass Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Mass Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={
                        displayedSessions.length > 0 &&
                        displayedSessions.every((session) =>
                          selectedSessions.includes(session.remoteJid)
                        )
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label>Select All</Label>
                  </div>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opened">Opened</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleMassStatusChange}>
                    Change Status of Selected ({selectedSessions.length})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Sessions Display */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Sessions ({filteredSessions.length} total)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedSessions.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      {sessions.length === 0 ? (
                        <div>
                          <p>No sessions found.</p>
                          <p className="text-sm">Instance: {instance?.name || "None"}</p>
                          <p className="text-sm">EvoAI ID: {evoaiId || "None"}</p>
                        </div>
                      ) : (
                        <p>No sessions match the current filters.</p>
                      )}
          </div>
                  ) : (
                    displayedSessions.map((session) => (
                      <Card key={session.remoteJid} className="relative">
                        <CardContent className="p-4">
                          <div className="absolute top-4 right-4">
                            <input
                              type="checkbox"
                              checked={selectedSessions.includes(session.remoteJid)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSessions((prev) => [
                                    ...prev,
                                    session.remoteJid,
                                  ]);
                                } else {
                                  setSelectedSessions((prev) =>
                                    prev.filter((id) => id !== session.remoteJid)
                                  );
                                }
                              }}
                              className="h-4 w-4"
                            />
          </div>

                          <div className="space-y-2">
                            <h3 className="font-semibold">
                              {session.pushName || "No Name"}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              <strong>Number:</strong> {session.remoteJid}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Status:</strong> {session.status}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <strong>Updated:</strong>{" "}
                              {new Date(session.updatedAt).toLocaleString()}
                            </p>
          </div>

                          <div className="absolute bottom-4 right-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {session.status !== "opened" && (
                  <DropdownMenuItem
                                    onClick={() =>
                                      changeStatus(session.remoteJid, "opened")
                                    }
                  >
                    <Play className="mr-2 h-4 w-4" />
                                    Open
                  </DropdownMenuItem>
                )}
                                {session.status !== "paused" &&
                                  session.status !== "closed" && (
                  <DropdownMenuItem
                                      onClick={() =>
                                        changeStatus(session.remoteJid, "paused")
                                      }
                  >
                    <Pause className="mr-2 h-4 w-4" />
                                      Pause
                  </DropdownMenuItem>
                )}
                {session.status !== "closed" && (
                  <DropdownMenuItem
                                    onClick={() =>
                                      changeStatus(session.remoteJid, "closed")
                                    }
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                                    Close
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                                  onClick={() =>
                                    changeStatus(session.remoteJid, "delete")
                                  }
                >
                  <Delete className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    openSendMessageModal(session.remoteJid)
                                  }
                                >
                                  <MessageSquare className="mr-2 h-4 w-4" />
                                  Send Message
                                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>

                {/* Pagination */}
                <div className="flex justify-center gap-4 mt-6">
                  <Button
                    variant="outline"
                    onClick={showMore}
                    disabled={sessionsDisplayed >= filteredSessions.length}
                  >
                    Show More
                  </Button>
                  <Button
                    variant="outline"
                    onClick={showAll}
                    disabled={sessionsDisplayed >= filteredSessions.length}
                  >
                    Show All
          </Button>
                  <Button
                    variant="outline"
                    onClick={showLess}
                    disabled={sessionsDisplayed <= sessionsPerPage}
                  >
                    Show Less
              </Button>
            </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Send Message Modal */}
      <Dialog open={sendMessageOpen} onOpenChange={setSendMessageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>To: {selectedSessionForMessage}</Label>
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Type your message here..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setSendMessageOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={sendMessage} disabled={!messageText.trim()}>
                Send Message
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export { SessionsEvoai };

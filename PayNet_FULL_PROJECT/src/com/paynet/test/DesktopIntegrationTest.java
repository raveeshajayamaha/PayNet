package com.paynet.test;

import com.paynet.client.*;
import com.paynet.client.ui.Theme;
import com.paynet.server.TcpServer;
import com.paynet.server.service.PaymentServiceImpl;
import javax.swing.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.concurrent.*;


/** Real Swing/controller + TCP regression check; uses an isolated temporary data directory. */
public final class DesktopIntegrationTest {
    private static int passed;
    private static Object field(Object o,String name)throws Exception {Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(o);}
    private static void call(Object o,String name)throws Exception {Method m=o.getClass().getDeclaredMethod(name);m.setAccessible(true);m.invoke(o);}
    private static void edt(Runnable r)throws Exception {SwingUtilities.invokeAndWait(r);}
    private static <T>T onEdt(Callable<T> c)throws Exception {FutureTask<T> f=new FutureTask<>(c);SwingUtilities.invokeAndWait(f);return f.get();}
    private static void text(PayNetGui g,String name,String value)throws Exception {edt(()->{try{((JTextField)field(g,name)).setText(value);}catch(Exception e){throw new RuntimeException(e);}});}
    private static void action(PayNetGui g,String name)throws Exception {edt(()->{try{call(g,name);}catch(Exception e){throw new RuntimeException(e);}});}
    private static void waitFor(String name,Callable<Boolean> condition)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(12);while(System.nanoTime()<end){if(onEdt(condition)){System.out.println("PASS  "+name);passed++;return;}Thread.sleep(40);}throw new AssertionError(name);}
    private static String label(PayNetGui g,String name)throws Exception {return ((JLabel)field(g,name)).getText();}
    private static boolean idle(PayNetGui g)throws Exception {return !(Boolean)field(g,"busy");}
    private static void login(PayNetGui g,int port,String name,boolean register)throws Exception {text(g,"port",String.valueOf(port));text(g,"user",name);text(g,"password","secret123");text(g,"full","Desktop Test");edt(()->{try{if((Boolean)field(g,"registering")!=register)((JButton)field(g,"authSwitch")).doClick();}catch(Exception e){throw new RuntimeException(e);}});action(g,"authenticate");waitFor("authenticate "+name,()->idle(g)&&field(g,"username")!=null);}
    private static void capture(PayNetGui g,Path output)throws Exception {edt(()->{try{BufferedImage image=new BufferedImage(g.getWidth(),g.getHeight(),BufferedImage.TYPE_INT_RGB);Graphics2D p=image.createGraphics();g.paint(p);p.dispose();javax.imageio.ImageIO.write(image,"png",output.toFile());}catch(Exception e){throw new RuntimeException(e);}});}
    public static void main(String[] args)throws Exception {
        Path data=Files.createTempDirectory("paynet-ui-test-");TcpServer server=new TcpServer(new PaymentServiceImpl(data),0);server.start();
        PayNetGui a=null,b=null;
        try {
            String java=Paths.get(System.getProperty("java.home"),"bin","java.exe").toString();
            Process smoke=new ProcessBuilder(java,"-cp",System.getProperty("java.class.path"),"com.paynet.test.ProtocolSmokeTest","localhost",String.valueOf(server.getPort())).inheritIO().start();
            if(smoke.waitFor()!=0)throw new AssertionError("Protocol suite failed");
            a=onEdt(()->{Theme.install();PayNetGui g=new PayNetGui();g.setVisible(true);return g;});b=onEdt(()->{PayNetGui g=new PayNetGui();g.setVisible(true);return g;});final PayNetGui first=a,second=b;
            login(a,server.getPort(),"desktopalice",true);login(b,server.getPort(),"desktopbob",true);
            waitFor("initial balance",()->label(first,"balance").equals("1000.00"));
            // Exercise the actual simulated-deposit dialog and its controller handler.
            edt(()->{javax.swing.Timer timer=new javax.swing.Timer(100,e->{for(Window w:Window.getWindows())if(w instanceof JDialog&&w.isVisible()){JOptionPane pane=findPane(((JDialog)w).getContentPane());if(pane!=null){pane.setInputValue("50.00");pane.setValue(JOptionPane.OK_OPTION);((javax.swing.Timer)e.getSource()).stop();}}});timer.start();try{call(first,"deposit");}catch(Exception ex){throw new RuntimeException(ex);}});
            waitFor("GUI deposit confirmed",()->idle(first)&&label(first,"balance").equals("1050.00"));
            text(a,"recipient","desktopbob");text(a,"amount","25.00");text(a,"note","Desktop integration transfer");action(a,"transferMoney");
            waitFor("sender balance confirmed",()->idle(first)&&label(first,"balance").equals("1025.00"));
            waitFor("second window receives live balance",()->label(second,"balance").equals("1025.00"));
            waitFor("live history populated",()->{Object history=field(first,"history");Object model=field(history,"model");return ((javax.swing.table.TableModel)model).getRowCount()>=3;});
            text(a,"amount","0");action(a,"transferMoney");waitFor("zero amount rejected",()->label(first,"notice").contains("positive"));
            text(a,"amount","1.001");action(a,"transferMoney");waitFor("fractional cent rejected",()->label(first,"notice").contains("positive"));
            text(a,"amount","999999.00");action(a,"transferMoney");waitFor("insufficient funds handled",()->idle(first)&&((JLabel)field(first,"notice")).getForeground().equals(Theme.ERROR));
            text(a,"recipient","missingrecipient");text(a,"amount","1");action(a,"transferMoney");waitFor("missing recipient handled",()->idle(first)&&((JLabel)field(first,"notice")).getForeground().equals(Theme.ERROR));
            action(a,"refresh");waitFor("failed payments leave balance unchanged",()->idle(first)&&label(first,"balance").equals("1025.00"));
            Path screenshots=Paths.get("docs","ui-preview");Files.createDirectories(screenshots);capture(a,screenshots.resolve("dashboard.png"));
            edt(()->first.setSize(1020,700));capture(a,screenshots.resolve("dashboard-minimum.png"));
            edt(()->{try{Method m=PayNetGui.class.getDeclaredMethod("navigate",String.class);m.setAccessible(true);m.invoke(first,"Send money");}catch(Exception e){throw new RuntimeException(e);}});capture(a,screenshots.resolve("transfer.png"));
            action(a,"signOut");waitFor("logout",()->idle(first)&&field(first,"username")==null);
            capture(a,screenshots.resolve("authentication.png"));login(a,server.getPort(),"desktopalice",false);waitFor("login again preserves balance",()->label(first,"balance").equals("1025.00"));
            server.stop();waitFor("server disconnect returns to authentication",()->field(first,"username")==null&&idle(first));
            System.out.println("Desktop checks passed: "+passed);System.out.println("Isolated test data: "+data);
        }finally{final PayNetGui x=a,y=b;edt(()->{if(x!=null)x.dispose();if(y!=null)y.dispose();});server.stop();}
    }
    private static JOptionPane findPane(Container c){for(Component x:c.getComponents()){if(x instanceof JOptionPane)return (JOptionPane)x;if(x instanceof Container){JOptionPane p=findPane((Container)x);if(p!=null)return p;}}return null;}
}

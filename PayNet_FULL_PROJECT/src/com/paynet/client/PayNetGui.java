package com.paynet.client;

import com.paynet.common.Money;
import com.paynet.common.Transaction;
import com.paynet.client.ui.*;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.event.*;
import java.util.List;
import java.util.concurrent.*;

/** Desktop controller. All protocol calls are serialized off the EDT. */
public class PayNetGui extends JFrame {
    private final NetClient client=new NetClient();
    private final ExecutorService net=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"paynet-network");t.setDaemon(true);return t;});
    private final CardLayout screens=new CardLayout(), pages=new CardLayout();
    private final JPanel root=new JPanel(screens), content=new JPanel(pages);
    private final JTextField host=new JTextField("localhost"), port=new JTextField("5000"), user=new JTextField(), full=new JTextField();
    private final JPasswordField password=new JPasswordField();
    private final JTextField recipient=new JTextField(), amount=new JTextField(), note=new JTextField();
    private final JLabel authMessage=Theme.label("Connect to your PayNet server to continue.",13,Theme.MUTED);
    private final JLabel greeting=Theme.label("",28,Theme.INK), balance=Theme.label("--",44,Color.WHITE), identity=Theme.label("",14,Color.WHITE);
    private final JLabel endpoint=Theme.label("",12,new Color(0xCBD5E1)), title=Theme.label("Dashboard",18,Theme.INK);
    private final ToastLabel notice=new ToastLabel();
    private final JLabel avatar=Theme.label("",16,Theme.BRAND);
    private final TransactionHistory history=new TransactionHistory();
    private final ModernButton signIn=button("Sign in","send",Theme.BRAND), authSwitch=button("Create an account","plus",Theme.DARK);
    private final ModernButton send=button("Send money","send",Theme.BRAND), deposit=button("Deposit","plus",Theme.BRAND), refresh=button("Refresh","refresh",Theme.DARK), logout=button("Log out","logout",Theme.DARK);
    private final java.util.List<ModernButton> navigation=new java.util.ArrayList<>();
    private final JProgressBar progress=new JProgressBar();
    private boolean registering, busy, closing;
    private String username;
    private long session;

    public PayNetGui(){
        super("PayNet | Real-time payments");
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);setMinimumSize(new Dimension(1020,700));setSize(1240,740);
        root.add(authentication(),"auth");root.add(workspace(),"app");setContentPane(root);setLocationRelativeTo(null);
        client.setListener(new NetClient.EventListener(){
            public void onTransaction(Transaction t){SwingUtilities.invokeLater(()->{if(username==null)return;history.add(t);if(t.getTo().equals(username)&&!t.getFrom().equals("SYSTEM"))message("Received "+Money.format(t.getCents())+" from "+t.getFrom(),false);refreshBalance();});}
            public void onDisconnected(){SwingUtilities.invokeLater(()->{if(closing)return;if(username!=null){session++;username=null;setBusy(false);balance.setText("--");history.clear();screens.show(root,"auth");}authMessage.setText("Connection closed. Sign in to reconnect.");authMessage.setForeground(Theme.ERROR);});}
        });
        addWindowListener(new WindowAdapter(){@Override public void windowClosed(WindowEvent e){closing=true;session++;client.setListener(null);net.shutdownNow();Thread cleanup=new Thread(client::close,"paynet-close");cleanup.setDaemon(true);cleanup.start();}});
    }
    private ModernButton button(String s,String icon,Color color){return new ModernButton(s,icon,color);}
    private JPanel authentication(){
        JPanel outer=new JPanel(new GridBagLayout());outer.setBackground(Theme.BG);
        JPanel pair=new JPanel(new GridLayout(1,2,0,0));pair.setPreferredSize(new Dimension(900,620));
        JPanel brand=new Theme.RoundedPanel(Theme.DARK);brand.setLayout(new BorderLayout());brand.setBorder(new EmptyBorder(40,38,40,38));
        brand.add(Theme.label("P /  PAYNET",27,Color.WHITE),BorderLayout.NORTH);
        JPanel story=Theme.stack(0);story.add(Theme.label("Your money.",36,Color.WHITE));story.add(Theme.label("Moving together.",32,new Color(0x5EEAD4)));story.add(Box.createVerticalStrut(24));story.add(Theme.label("Real-time payments. One connected network.",13,new Color(0xCBD5E1)));story.add(Box.createVerticalStrut(35));story.add(Theme.label("01   Connect to your server",14,Color.WHITE));story.add(Box.createVerticalStrut(15));story.add(Theme.label("02   Send and receive instantly",14,Color.WHITE));story.add(Box.createVerticalStrut(15));story.add(Theme.label("03   Follow every transaction",14,Color.WHITE));brand.add(story,BorderLayout.CENTER);
        brand.add(Theme.label("PAYNET  /  NETWORK PAYMENT SIMULATION",11,new Color(0x94A3B8)),BorderLayout.SOUTH);
        JPanel form=Theme.card();form.setLayout(new BorderLayout(0,8));JPanel fields=Theme.stack(0);
        JLabel heading=Theme.label("Welcome back",27,Theme.INK);fields.add(heading);fields.add(Box.createVerticalStrut(6));fields.add(Theme.label("Your network. Your account.",14,Theme.MUTED));fields.add(Box.createVerticalStrut(22));
        JPanel server=new JPanel(new GridLayout(1,2,12,0));server.setOpaque(false);JPanel h=Theme.stack(0),p=Theme.stack(0);Theme.entry(h,"Server host",host);Theme.entry(p,"Port",port);server.add(h);server.add(p);server.setMaximumSize(new Dimension(Integer.MAX_VALUE,78));fields.add(server);
        Theme.entry(fields,"Username",user);Theme.entry(fields,"Password",password);
        JCheckBox show=new JCheckBox("Show password");show.setOpaque(false);char echo=password.getEchoChar();show.addActionListener(e->password.setEchoChar(show.isSelected()?(char)0:echo));fields.add(show);fields.add(Box.createVerticalStrut(12));
        JPanel name=Theme.stack(0);Theme.entry(name,"Full name",full);name.setVisible(false);fields.add(name);
        JPanel actions=new JPanel(new GridLayout(1,2,8,0));actions.setOpaque(false);actions.add(signIn);actions.add(authSwitch);fields.add(actions);form.add(fields,BorderLayout.NORTH);form.add(authMessage,BorderLayout.SOUTH);
        authSwitch.addActionListener(e->{registering=!registering;name.setVisible(registering);heading.setText(registering?"Create your account":"Welcome back");signIn.setText(registering?"Register & sign in":"Sign in");authSwitch.setText(registering?"Back to sign in":"Create an account");form.revalidate();});signIn.addActionListener(e->authenticate());password.addActionListener(e->authenticate());
        pair.add(brand);pair.add(form);outer.add(pair);return outer;
    }
    private JPanel workspace(){
        JPanel app=new JPanel(new BorderLayout());app.setBackground(Theme.BG);
        JPanel side=new JPanel(new BorderLayout(0,30));side.setBackground(Theme.DARK);side.setPreferredSize(new Dimension(218,0));side.setBorder(new EmptyBorder(30,20,24,20));
        JPanel links=Theme.stack(0);links.add(Theme.label("P /  PAYNET",25,Color.WHITE));links.add(Box.createVerticalStrut(8));links.add(Theme.label("REAL-TIME PAYMENTS",10,new Color(0x94A3B8)));links.add(Box.createVerticalStrut(45));links.add(Theme.label("WORKSPACE",11,new Color(0x94A3B8)));links.add(Box.createVerticalStrut(16));
        String[] names={"Dashboard","Send money","Transactions"},icons={"grid","send","history"};for(int i=0;i<names.length;i++){final String n=names[i];ModernButton b=button(n,icons[i],Theme.DARK);b.setAlignmentX(0);b.setMaximumSize(new Dimension(Integer.MAX_VALUE,46));b.addActionListener(e->navigate(n));navigation.add(b);links.add(b);links.add(Box.createVerticalStrut(8));}side.add(links,BorderLayout.NORTH);
        JPanel account=Theme.stack(0);account.add(Theme.label("CONNECTED / TCP",12,new Color(0x5EEAD4)));account.add(Box.createVerticalStrut(8));account.add(endpoint);account.add(Box.createVerticalStrut(24));account.add(identity);account.add(Box.createVerticalStrut(14));account.add(logout);logout.addActionListener(e->signOut());side.add(account,BorderLayout.SOUTH);app.add(side,BorderLayout.WEST);
        JPanel main=new JPanel(new BorderLayout(0,20));main.setOpaque(false);main.setBorder(new EmptyBorder(24,28,16,28));JPanel header=new JPanel(new BorderLayout());header.setOpaque(false);header.add(title,BorderLayout.WEST);header.add(Theme.row(Theme.label("Live connection",12,Theme.BRAND),avatar),BorderLayout.EAST);main.add(header,BorderLayout.NORTH);
        content.setOpaque(false);content.add(dashboard(),"Dashboard");content.add(transfer(),"Send money");JPanel hist=Theme.card();hist.setLayout(new BorderLayout(0,16));hist.add(Theme.label("Transaction history",22,Theme.INK),BorderLayout.NORTH);hist.add(history,BorderLayout.CENTER);content.add(hist,"Transactions");main.add(content,BorderLayout.CENTER);
        JPanel footer=new JPanel(new BorderLayout(12,0));footer.setOpaque(false);footer.add(notice,BorderLayout.CENTER);progress.setIndeterminate(true);progress.setPreferredSize(new Dimension(90,4));progress.setVisible(false);footer.add(progress,BorderLayout.EAST);main.add(footer,BorderLayout.SOUTH);app.add(main,BorderLayout.CENTER);return app;
    }
    private JPanel dashboard(){
        JPanel page=new JPanel(new BorderLayout(0,22));page.setOpaque(false);JPanel top=Theme.stack(0);top.add(greeting);top.add(Box.createVerticalStrut(6));top.add(Theme.label("A clear view of your connected account.",14,Theme.MUTED));top.add(Box.createVerticalStrut(24));
        JPanel funds=new BalanceCard();funds.setLayout(new BorderLayout());funds.setBorder(new EmptyBorder(18,30,18,30));funds.setAlignmentX(0);funds.setMaximumSize(new Dimension(Integer.MAX_VALUE,160));JPanel numbers=Theme.stack(0);numbers.add(Theme.label("AVAILABLE BALANCE",12,new Color(0xCCFBF1)));numbers.add(Box.createVerticalStrut(14));numbers.add(balance);numbers.add(Box.createVerticalStrut(12));numbers.add(Theme.label("Simulation funds / decimal units",12,new Color(0xCCFBF1)));funds.add(numbers,BorderLayout.CENTER);refresh.addActionListener(e->refresh());funds.add(Theme.row(refresh),BorderLayout.EAST);top.add(funds);page.add(top,BorderLayout.NORTH);
        JPanel lower=new JPanel(new BorderLayout(0,20));lower.setOpaque(false);JPanel quick=Theme.card();quick.setLayout(new BorderLayout(0,14));ModernButton transfer=button("Send money","send",Theme.BRAND),view=button("View transactions","history",Theme.DARK);transfer.addActionListener(e->navigate("Send money"));view.addActionListener(e->navigate("Transactions"));deposit.addActionListener(e->deposit());quick.add(Theme.row(transfer,deposit,view),BorderLayout.CENTER);lower.add(quick,BorderLayout.NORTH);
        JPanel info=Theme.card();info.setLayout(new BorderLayout(0,12));info.add(Theme.label("Recent activity",20,Theme.INK),BorderLayout.NORTH);info.add(history.sharedView(),BorderLayout.CENTER);lower.add(info,BorderLayout.CENTER);page.add(lower,BorderLayout.CENTER);return page;
    }
    private JPanel transfer(){
        JPanel page=new JPanel(new BorderLayout(0,16));page.setOpaque(false);page.add(Theme.label("Send money",28,Theme.INK),BorderLayout.NORTH);JPanel form=Theme.card();form.setLayout(new BorderLayout());JPanel fields=Theme.stack(0);fields.add(Theme.label("A few details. One simple transfer.",19,Theme.INK));fields.add(Box.createVerticalStrut(24));Theme.entry(fields,"Recipient username",recipient);Theme.entry(fields,"Amount",amount);Theme.entry(fields,"Note (optional)",note);fields.add(Theme.label("Use up to two decimal places. The server confirms each payment.",13,Theme.MUTED));fields.add(Box.createVerticalStrut(24));ModernButton reset=button("Reset","refresh",Theme.DARK);reset.addActionListener(e->{if(!busy){recipient.setText("");amount.setText("");note.setText("");recipient.requestFocusInWindow();}});send.addActionListener(e->transferMoney());fields.add(Theme.row(send,reset));form.add(fields,BorderLayout.NORTH);page.add(form,BorderLayout.CENTER);return page;
    }
    private void navigate(String name){pages.show(content,name);title.setText(name);for(ModernButton b:navigation){b.setForeground(b.getText().equals(name)?new Color(0x5EEAD4):Color.WHITE);b.setText(b.getText());}if(name.equals("Send money"))recipient.requestFocusInWindow();}
    private void authenticate(){
        if(busy)return;String h=host.getText().trim(),u=user.getText().trim().toLowerCase(java.util.Locale.ROOT),f=full.getText().trim();char[] chars=password.getPassword();String pass=new String(chars);java.util.Arrays.fill(chars,'\0');int p;
        try{p=Integer.parseInt(port.getText().trim());if(p<1||p>65535)throw new NumberFormatException();}catch(NumberFormatException ex){authError("Enter a port between 1 and 65535.");return;}
        if(h.isEmpty()||u.isEmpty()||pass.isEmpty()||(registering&&f.isEmpty())){authError("Complete all required fields.");return;}
        boolean reg=registering;setBusy(true);authMessage.setForeground(Theme.MUTED);authMessage.setText(reg?"Creating your account...":"Connecting...");
        net.submit(()->{try{client.close();client.connect(h,p);if(reg)client.register(u,pass,f);long b=client.login(u,pass);List<Transaction> tx=client.history(100);SwingUtilities.invokeLater(()->{if(closing)return;setBusy(false);username=u;session++;balance.setText(Money.format(b));history.setAll(tx,u);greeting.setText("Welcome back, "+u);identity.setText("@"+u);endpoint.setText(h+":"+p);avatar.setText(u.substring(0,1).toUpperCase());password.setText("");navigate("Dashboard");screens.show(root,"app");message("Connected. Your account is up to date.",false);});}catch(Exception ex){client.close();SwingUtilities.invokeLater(()->{setBusy(false);authError(ex.getMessage());});}});
    }
    private void authError(String s){authMessage.setForeground(Theme.ERROR);authMessage.setText(s);authMessage.setToolTipText(s);}
    private void setBusy(boolean b){busy=b;signIn.setEnabled(!b);authSwitch.setEnabled(!b);send.setEnabled(!b);deposit.setEnabled(!b);refresh.setEnabled(!b);logout.setEnabled(!b);progress.setVisible(b);send.setText(b?"Please wait...":"Send money");}
    private long parseAmount(String s){long c=Money.parse(s);if(c<=0)throw new IllegalArgumentException();return c;}
    private void transferMoney(){if(busy||username==null)return;String to=recipient.getText().trim(),n=note.getText().trim();long cents;try{cents=parseAmount(amount.getText());}catch(RuntimeException ex){message("Enter a positive amount with up to two decimal places.",true);return;}if(to.isEmpty()){message("Enter a recipient username.",true);return;}execute(()->{long b=client.transfer(to,cents,n);return ()->{balance.setText(Money.format(b));amount.setText("");note.setText("");message("Sent "+Money.format(cents)+" to "+to+".",false);};});}
    private void deposit(){if(busy||username==null)return;String s=JOptionPane.showInputDialog(this,"Amount to add (simulation funds)","Deposit",JOptionPane.PLAIN_MESSAGE);if(s==null)return;long c;try{c=parseAmount(s);}catch(RuntimeException ex){message("Enter a positive amount with up to two decimal places.",true);return;}execute(()->{long b=client.deposit(c);return ()->{balance.setText(Money.format(b));message("Deposited "+Money.format(c)+" in simulation funds.",false);};});}
    @FunctionalInterface private interface Operation{Runnable run()throws Exception;}
    private void execute(Operation op){if(busy||username==null)return;long token=session;setBusy(true);net.submit(()->{try{Runnable done=op.run();SwingUtilities.invokeLater(()->{if(token!=session||closing)return;setBusy(false);done.run();});}catch(Exception ex){SwingUtilities.invokeLater(()->{if(token!=session||closing)return;setBusy(false);message(ex.getMessage(),true);if(!client.isConnected()){username=null;session++;screens.show(root,"auth");authError("Connection lost. Sign in to reconnect.");}});}});}
    private void refresh(){execute(()->{long b=client.balance();List<Transaction> tx=client.history(100);return ()->{balance.setText(Money.format(b));history.setAll(tx,username);message("Balance and history refreshed.",false);};});}
    private void refreshBalance(){long token=session;net.submit(()->{try{long b=client.balance();SwingUtilities.invokeLater(()->{if(token==session&&username!=null)balance.setText(Money.format(b));});}catch(ClientException ignored){}});}
    private void signOut(){if(busy)return;session++;username=null;setBusy(true);net.submit(()->{client.logout();SwingUtilities.invokeLater(()->{setBusy(false);history.clear();balance.setText("--");recipient.setText("");amount.setText("");note.setText("");screens.show(root,"auth");authMessage.setForeground(Theme.MUTED);authMessage.setText("You have signed out.");});});}
    private void message(String s,boolean error){notice.showMessage(s,error);}
    public static void main(String[] args){SwingUtilities.invokeLater(()->{Theme.install();new PayNetGui().setVisible(true);});}
}
